/**
 * 'verified' requires that tests actually ran and none were deleted
 * (AGENT-15; REQ-agent-185, REQ-discord-185).
 *
 * - The lane's test summary is read (bun test, jest, vitest, cargo test,
 *   pytest, go test); skipped and todo tests don't count; no recognised
 *   summary fails closed with a note naming the verify lane.
 * - Test names are compared before and after across the repo root: a
 *   deleted, retitled, skipped, todo or `.only`-silenced test is dropped and
 *   named; a renamed file or a test moved to another file is not.
 * - Non-git projects get a walk of their test files at run start.
 * - /work checks the tree against the merge-base before commit and push.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTask } from "../src/agent/loop.ts";
import {
  countExecutedTests,
  droppedTests,
  isTestFilePath,
  judgeTestEvidence,
  startTestNameWalk,
  testDeclarations,
} from "../src/agent/test-evidence.ts";
import type { AgentEvent, ExecuteFn, TaskResult, VerifyRunner } from "../src/agent/types.ts";
import * as workspaceDiff from "../src/agent/workspace-diff.ts";
import { settleTalkVerified } from "../src/worktree/base.ts";
import { openWorkPr, WORK_PR_PLUGINS } from "../src/work/pr.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";
import { gitIn, makeTalk } from "./fixtures/talk-worktree.ts";

const root = join(import.meta.dir, "..");
const bases: string[] = [];
afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

function tempBase(): string {
  const b = mkdtempSync(join(tmpdir(), "corvidinho-test-evidence-"));
  bases.push(b);
  return b;
}

const BUN_SUMMARY = (pass: number, fail = 0, skip = 0, todo = 0) =>
  `bun test v1.4.2\n\n ${pass} pass\n${skip ? ` ${skip} skip\n` : ""}${todo ? ` ${todo} todo\n` : ""} ${fail} fail\nRan ${pass + fail + skip + todo} tests across 1 file. [5.00ms]\n`;

const SUITE = [
  'import { expect, test } from "bun:test";',
  'test("adds numbers", () => expect(1 + 1).toBe(2));',
  'test("keeps order", () => expect([1, 2]).toEqual([1, 2]));',
  "",
].join("\n");

/** `<base>/project`: a git repo on `main` with `app.ts` and `tests/math.test.ts`. */
function makeRepo(base: string): string {
  const dir = join(base, "project");
  mkdirSync(join(dir, "tests"), { recursive: true });
  gitIn(dir, "init", "-q", "-b", "main");
  gitIn(dir, "config", "user.name", "Fixture Bot");
  gitIn(dir, "config", "user.email", "fixture@example.invalid");
  gitIn(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "app.ts"), "export const x = 1;\n");
  writeFileSync(join(dir, "tests/math.test.ts"), SUITE);
  gitIn(dir, "add", ".");
  gitIn(dir, "commit", "-q", "-m", "init");
  return dir;
}

/** A verify runner answering `outputs` in turn (last repeats); every lane passes unless `fail`. */
function lane(outputs: string[] = [LANE_PASS_OUTPUT], fail = false) {
  const calls: string[] = [];
  const runner: VerifyRunner = async (cwd) => {
    calls.push(cwd);
    return { success: !fail, output: outputs[Math.min(calls.length - 1, outputs.length - 1)]! };
  };
  return { calls, runner };
}

function texts(events: AgentEvent[]): string[] {
  return events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
}

async function run(
  cwd: string,
  execute: ExecuteFn,
  verifyRunner: VerifyRunner,
  maxRetries = 0,
): Promise<{ result: TaskResult; events: AgentEvent[] }> {
  const events: AgentEvent[] = [];
  const result = await runTask({
    cwd,
    maxRetries,
    verifyRunner,
    execute,
    onEvent: (e) => events.push(e),
  });
  return { result, events };
}

/** An attempt that edits `app.ts` and then does `also` in the project. */
function editing(dir: string, also: () => void = () => {}): ExecuteFn {
  return async () => {
    writeFileSync(join(dir, "app.ts"), "export const x = 2;\n");
    also();
    return { summary: "edited", filesChanged: ["app.ts"] };
  };
}

describe("tests ran: the lane's test summary (AGENT-15, REQ-agent-185)", () => {
  test("bun test: pass and fail count, skip and todo don't", () => {
    expect(countExecutedTests(BUN_SUMMARY(4, 1, 2, 3))).toEqual({
      recognised: true,
      executed: 5,
      runners: [{ runner: "bun test", executed: 5 }],
    });
    const skipped = countExecutedTests(BUN_SUMMARY(0, 0, 3, 1));
    expect(skipped.recognised).toBe(true);
    expect(skipped.executed).toBe(0);
  });

  test("the real bun test output of this Bun is recognised (stdout then stderr, as the verify runner joins them)", async () => {
    const dir = join(tempBase(), "suite");
    mkdirSync(dir);
    writeFileSync(
      join(dir, "a.test.ts"),
      'import { test } from "bun:test";\ntest("one", () => {});\ntest("two", () => {});\ntest.skip("three", () => {});\ntest.todo("four");\n',
    );
    const proc = Bun.spawn(["bun", "test"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "1" },
    });
    const [code, out, err] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    expect(code).toBe(0);
    const e = countExecutedTests(`${out}${err}`);
    expect(e.recognised).toBe(true);
    expect(e.executed).toBe(2);
    expect(e.runners).toEqual([{ runner: "bun test", executed: 2 }]);
  }, 60_000);

  test("jest, vitest, cargo test, pytest and go test summaries", () => {
    expect(countExecutedTests("Tests:       1 failed, 2 skipped, 1 todo, 5 passed, 9 total\n").executed).toBe(6);
    expect(countExecutedTests("      Tests  1 failed | 4 passed | 1 skipped (6)\n").executed).toBe(5);
    const cargo = countExecutedTests(
      "test result: ok. 3 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s\n" +
        "test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.10s\n",
    );
    expect(cargo.executed).toBe(5);
    expect(cargo.runners[0]!.runner).toBe("cargo test");
    expect(countExecutedTests("========= 3 passed, 1 skipped, 1 xfailed in 0.12s =========\n").executed).toBe(4);
    expect(countExecutedTests("\u001b[32m3 passed\u001b[0m in 0.12s\n").executed).toBe(3);
    const none = countExecutedTests("============ no tests ran in 0.01s ============\n");
    expect(none).toEqual({ recognised: true, executed: 0, runners: [{ runner: "pytest", executed: 0 }] });
    expect(countExecutedTests("ok  \texample.com/a\t0.012s\nok  \texample.com/b\t0.01s [no tests to run]\n").executed).toBe(1);
    expect(
      countExecutedTests("=== RUN   TestA\n--- PASS: TestA (0.00s)\n    --- PASS: TestA/sub (0.00s)\n--- FAIL: TestB (0.00s)\n--- SKIP: TestC (0.00s)\n").executed,
    ).toBe(2);
    const noFiles = countExecutedTests("?   \texample.com/c\t[no test files]\n");
    expect(noFiles).toEqual({ recognised: true, executed: 0, runners: [{ runner: "go test", executed: 0 }] });
  });

  test("anything else is no recognised summary", () => {
    for (const out of ["ok", "", "All checks passed.\n", "tests: fine\n", "Ran the linter across 3 files\n"]) {
      expect(countExecutedTests(out).recognised).toBe(false);
    }
  });

  test("the verdict names what is missing and the verify lane", () => {
    const none = judgeTestEvidence("typecheck ok\n", []);
    expect(none.ok).toBe(false);
    expect(none.note).toContain("the verify lane (fledge lanes run verify) passed, but it printed no test summary Corvidinho recognises");
    expect(none.note).toContain("bun test, jest, vitest, cargo test, pytest, go test");
    const zero = judgeTestEvidence(BUN_SUMMARY(0, 0, 2), []);
    expect(zero.note).toContain("no test ran (bun test: 0; skipped and todo tests don't count)");
    const both = judgeTestEvidence("nothing", [{ name: "keeps order", file: "tests/math.test.ts" }]);
    expect(both.note).toContain("printed no test summary");
    expect(both.note).toContain('1 test(s) were deleted or turned off (removed, retitled, skip, todo, or silenced by only): "keeps order" (tests/math.test.ts)');
    expect(judgeTestEvidence(BUN_SUMMARY(3), null).note).toContain(
      "could not read the test files to check that no test was deleted",
    );
    expect(judgeTestEvidence(BUN_SUMMARY(3), [])).toEqual({
      ok: true,
      note: "Verify gate: 3 test(s) ran (bun test: 3), and none were deleted.",
    });
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `t${i} ${"x".repeat(200)}`, file: "a.test.ts" }));
    const long = judgeTestEvidence(BUN_SUMMARY(3), many).note;
    expect(long.length).toBeLessThan(2000);
    expect(long).toMatch(/and \d+ more/);
  });
});

describe("test declarations (REQ-agent-185)", () => {
  test("JS/TS: skip, todo, x-names, conditional and skipped suites are not active; comments are not tests", () => {
    const src = [
      'import { describe, test, it } from "bun:test";',
      '// test("commented out", () => {});',
      '/* test("in a block comment", () => {}) */',
      "const re = /test\\(/;",
      'test("runs", () => {});',
      'test.skip("skipped", () => {});',
      'test.todo("later");',
      'it.each([[1], [2]])("each %i", () => {});',
      'test.skipIf(process.platform === "linux")("conditional", () => {});',
      'describe("suite", () => {',
      '  test("inner", () => {});',
      '  describe.skip("off", () => { test("deep", () => {}); });',
      "});",
      'xit("x-named", () => {});',
      "test(`template ${1}`, () => {});",
      'helpers.test("not a declaration", () => {});',
      "",
    ].join("\n");
    expect(testDeclarations("tests/a.test.ts", src)).toEqual([
      { name: "runs", active: true },
      { name: "skipped", active: false },
      { name: "later", active: false },
      { name: "each %i", active: true },
      { name: "conditional", active: false, conditional: true },
      { name: "inner", active: true },
      { name: "deep", active: false },
      { name: "x-named", active: false },
      { name: "template ${1}", active: true },
    ]);
  });

  test("JS/TS: a .only silences its file's other tests", () => {
    expect(
      testDeclarations(
        "a.spec.ts",
        'test("a", () => {});\ntest.only("b", () => {});\ndescribe.only("s", () => { test("c", () => {}); });\n',
      ),
    ).toEqual([
      { name: "a", active: false },
      { name: "b", active: true },
      { name: "c", active: true },
    ]);
  });

  test("pytest, go test and cargo test declarations", () => {
    const py = [
      "import pytest",
      "def test_a():",
      "    pass",
      '@pytest.mark.skip(reason="slow")',
      "def test_b():",
      "    pass",
      "@pytest.mark.skipif(",
      '    True, reason="x")',
      "def test_c(): pass",
      "class TestK:",
      "    def test_d(self): pass",
      "    def helper(self): pass",
      "@pytest.mark.skip",
      "class TestOff:",
      "    def test_e(self): pass",
      "class Helper:",
      "    def test_not_collected(self): pass",
      '"""',
      "def test_in_a_docstring(): pass",
      '"""',
      "# def test_commented(): pass",
      "",
    ].join("\n");
    expect(testDeclarations("tests/test_x.py", py)).toEqual([
      { name: "test_a", active: true },
      { name: "test_b", active: false },
      { name: "test_c", active: false, conditional: true },
      { name: "test_d", active: true },
      { name: "test_e", active: false },
    ]);
    const go = 'package x\nimport "testing"\nfunc TestA(t *testing.T) {}\n// func TestB(t *testing.T) {}\nfunc helper(t *testing.T) {}\n/* func TestC(t *testing.T) {} */\n';
    expect(testDeclarations("x_test.go", go)).toEqual([{ name: "TestA", active: true }]);
    const rs = [
      "#[cfg(test)]",
      "mod tests {",
      "    #[test]",
      '    fn works() { let _u = "http://example"; }',
      "    #[test]",
      '    #[ignore = "slow"]',
      "    fn slow() {}",
      "    // #[test] fn commented() {}",
      "    #[tokio::test]",
      "    async fn async_one() {}",
      "    fn helper<'a>(s: &'a str) -> char { 'x' }",
      "}",
      "",
    ].join("\n");
    expect(testDeclarations("src/lib.rs", rs)).toEqual([
      { name: "works", active: true },
      { name: "slow", active: false },
      { name: "async_one", active: true },
    ]);
  });

  test("which paths are test files", () => {
    for (const p of ["a.test.ts", "src/x.spec.tsx", "b_test.js", "c_spec_.ts", "src/__tests__/d.js", "tests/test_e.py", "f_test.py", "g_test.go", "src/lib.rs"]) {
      expect(isTestFilePath(p)).toBe(true);
    }
    for (const p of ["app.ts", "types.d.ts", "test.md", "tests/helper.py", "main.go", "README.md"]) {
      expect(isTestFilePath(p)).toBe(false);
    }
  });

  test("dropped by name: moves and renamed files are not drops; a retitle or removal is", () => {
    const t = (...names: string[]) => names.map((name) => ({ name, active: true }));
    expect(droppedTests([{ file: "a.test.ts", decls: t("x", "y") }], [{ file: "b.test.ts", decls: t("y", "x") }])).toEqual([]);
    expect(
      droppedTests(
        [{ file: "a.test.ts", decls: t("x", "y") }],
        [
          { file: "a.test.ts", decls: t("x") },
          { file: "c.test.ts", decls: t("y") },
        ],
      ),
    ).toEqual([]);
    expect(droppedTests([{ file: "a.test.ts", decls: t("x", "y") }], [{ file: "a.test.ts", decls: t("x", "y2") }])).toEqual([
      { name: "y", file: "a.test.ts" },
    ]);
    // Two declarations with one name: removing one of them is a drop.
    expect(droppedTests([{ file: "a.test.ts", decls: t("x", "x") }], [{ file: "a.test.ts", decls: t("x") }])).toEqual([
      { name: "x", file: "a.test.ts" },
    ]);
    // A test that was already off is still a test: deleting it is a drop,
    // keeping it off is not.
    const off = [{ name: "z", active: false }];
    expect(droppedTests([{ file: "a.test.ts", decls: off }], [])).toEqual([{ name: "z", file: "a.test.ts" }]);
    expect(droppedTests([{ file: "a.test.ts", decls: off }], [{ file: "a.test.ts", decls: off }])).toEqual([]);
  });

  test("conditional tests (skipIf, if, runIf, pytest skipif) may run: deleting or turning one off is a drop; making a running one conditional is too", () => {
    const on = { name: "c", active: true };
    const cond = { name: "c", active: false, conditional: true as const };
    const off = { name: "c", active: false };
    const f = (...decls: { name: string; active: boolean; conditional?: true }[]) => [{ file: "a.test.ts", decls }];
    const dropped = [{ name: "c", file: "a.test.ts" }];
    expect(droppedTests(f(cond), f())).toEqual(dropped);
    expect(droppedTests(f(cond), f(off))).toEqual(dropped);
    expect(droppedTests(f(on), f(cond))).toEqual(dropped);
    expect(droppedTests(f(cond), f(cond))).toEqual([]);
    expect(droppedTests(f(cond), f(on))).toEqual([]);
    expect(droppedTests(f(cond), [{ file: "b.test.ts", decls: [cond] }])).toEqual([]);
    // One match per declaration, the strongest test first: [on, cond] → [cond, on] keeps both.
    expect(droppedTests(f(cond, on), f(on, cond))).toEqual([]);
    expect(droppedTests(f(off, on), f(on))).toEqual(dropped);
    // Order follows `before`.
    expect(
      droppedTests(
        [{ file: "a.test.ts", decls: [{ name: "x", active: false }, { name: "y", active: true }] }],
        [],
      ),
    ).toEqual([
      { name: "x", file: "a.test.ts" },
      { name: "y", file: "a.test.ts" },
    ]);
    // Parsed: bun's skipIf / describe.skipIf and pytest's skipif and module skipif mark.
    expect(
      testDeclarations(
        "a.test.ts",
        'describe.skipIf(!haveReal)("real", () => { test("inner", () => {}); test.skip("off", () => {}); });\ntest.if(ok)("gated", () => {});\n',
      ),
    ).toEqual([
      { name: "inner", active: false, conditional: true },
      { name: "off", active: false },
      { name: "gated", active: false, conditional: true },
    ]);
    expect(
      testDeclarations(
        "tests/test_m.py",
        'import pytest, sys\npytestmark = pytest.mark.skipif(sys.platform == "win32", reason="posix")\n@pytest.mark.skip\ndef test_off(): pass\ndef test_on(): pass\n',
      ),
    ).toEqual([
      { name: "test_off", active: false },
      { name: "test_on", active: false, conditional: true },
    ]);
  });
});

describe("the gate: a passing lane is verified only when tests ran and none were deleted (REQ-agent-185)", () => {
  test("a lane with no recognised test summary fails closed, the note names the verify lane, and the retry is told", async () => {
    const dir = makeRepo(tempBase());
    const v = lane(["▶️ Lane: verify\n  ▶️ Running task: lint\n✅ Lane verify completed\n"]);
    const feedbacks: (string | undefined)[] = [];
    const events: AgentEvent[] = [];
    const result = await runTask({
      cwd: dir,
      maxRetries: 1,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async (ctx) => {
        feedbacks.push(ctx.verifyFeedback);
        writeFileSync(join(dir, "app.ts"), `export const x = ${ctx.attempt};\n`);
        return { summary: "edited", filesChanged: ["app.ts"] };
      },
    });
    expect(v.calls.length).toBe(2);
    expect(result.state).toBe("failed");
    expect(result.verified).toBe(false);
    expect(result.summary).toContain("Verification failed after 1 retries:\nVerify gate: not verified: the verify lane (fledge lanes run verify) passed, but it printed no test summary");
    expect(feedbacks[1]).toStartWith("Verification failed. Fix these errors and try again:\n\nVerify gate: not verified: the verify lane");
    const verifyEvents = events.filter((e) => e.type === "VerifyResult") as { success: boolean; output: string }[];
    expect(verifyEvents.map((e) => e.success)).toEqual([false, false]);
    expect(verifyEvents[0]!.output).toContain("printed no test summary Corvidinho recognises");
  });

  test("a lane whose tests were all skipped did not run tests", async () => {
    const dir = makeRepo(tempBase());
    const { result, events } = await run(dir, editing(dir), lane([BUN_SUMMARY(0, 0, 2, 1)]).runner);
    expect(result.state).toBe("failed");
    expect(texts(events).join("\n")).toContain("no test ran (bun test: 0; skipped and todo tests don't count)");
  });

  test("tests ran and none deleted: verified, and the note says how many ran", async () => {
    const dir = makeRepo(tempBase());
    const { result, events } = await run(dir, editing(dir), lane([BUN_SUMMARY(12, 0, 1)]).runner);
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
    expect(texts(events)).toContain("Verify gate: 12 test(s) ran (bun test: 12), and none were deleted.");
  });

  test("a deleted test is named and the run is not verified; a retry that restores it is", async () => {
    const dir = makeRepo(tempBase());
    const suite = join(dir, "tests/math.test.ts");
    const feedbacks: (string | undefined)[] = [];
    const v = lane();
    const result = await runTask({
      cwd: dir,
      maxRetries: 1,
      verifyRunner: v.runner,
      execute: async (ctx) => {
        feedbacks.push(ctx.verifyFeedback);
        if (ctx.attempt === 1) {
          writeFileSync(suite, SUITE.replace('test("keeps order", () => expect([1, 2]).toEqual([1, 2]));\n', ""));
        } else {
          writeFileSync(suite, SUITE);
        }
        writeFileSync(join(dir, "app.ts"), `export const x = ${ctx.attempt + 1};\n`);
        return { summary: "edited", filesChanged: ["app.ts"] };
      },
    });
    expect(v.calls.length).toBe(2);
    expect(feedbacks[1]).toContain('"keeps order" (tests/math.test.ts)');
    expect(result.state).toBe("done");
    expect(result.verified).toBe(true);
  });

  for (const [what, edit, named] of [
    ["deleting a test file", (dir: string) => unlinkSync(join(dir, "tests/math.test.ts")), ['"adds numbers"', '"keeps order"']],
    ["turning a test into .skip", (dir: string) => writeFileSync(join(dir, "tests/math.test.ts"), SUITE.replace('test("keeps order"', 'test.skip("keeps order"')), ['"keeps order"']],
    ["turning a test into .todo", (dir: string) => writeFileSync(join(dir, "tests/math.test.ts"), SUITE.replace('test("keeps order", () => expect([1, 2]).toEqual([1, 2]));', 'test.todo("keeps order");')), ['"keeps order"']],
    ["adding a .only that silences its sibling", (dir: string) => writeFileSync(join(dir, "tests/math.test.ts"), SUITE.replace('test("adds numbers"', 'test.only("adds numbers"')), ['"keeps order"']],
    ["retitling a test", (dir: string) => writeFileSync(join(dir, "tests/math.test.ts"), SUITE.replace('"keeps order"', '"keeps the order"')), ['"keeps order"']],
    ["commenting a test out", (dir: string) => writeFileSync(join(dir, "tests/math.test.ts"), SUITE.replace('test("keeps order"', '// test("keeps order"')), ['"keeps order"']],
  ] as const) {
    test(`${what} is a dropped test, named in the note`, async () => {
      const dir = makeRepo(tempBase());
      const { result, events } = await run(dir, editing(dir, () => edit(dir)), lane().runner);
      expect(result.state).toBe("failed");
      expect(result.verified).toBe(false);
      const note = texts(events).find((t) => t.startsWith("Verify gate: not verified:"))!;
      for (const n of named) expect(note).toContain(`${n} (tests/math.test.ts)`);
      expect(note).toContain(`${named.length} test(s) were deleted or turned off`);
    });
  }

  test("deleting a conditional (skipIf) or already-skipped test is a drop; touching the file and keeping them is not", async () => {
    const dir = makeRepo(tempBase());
    const gated = [
      'import { describe, test } from "bun:test";',
      'test.skipIf(process.platform === "win32")("posix paths", () => {});',
      'describe.skipIf(!process.env.PATH)("with a PATH", () => { test("finds git", () => {}); });',
      'test.skip("parked", () => {});',
      "",
    ].join("\n");
    writeFileSync(join(dir, "tests/gated.test.ts"), gated);
    gitIn(dir, "add", ".");
    gitIn(dir, "commit", "-q", "-m", "gated");
    const kept = await run(
      dir,
      editing(dir, () => writeFileSync(join(dir, "tests/gated.test.ts"), `${gated}// touched\n`)),
      lane().runner,
    );
    expect(kept.result.verified).toBe(true);

    const gone = await run(
      dir,
      editing(dir, () => writeFileSync(join(dir, "tests/gated.test.ts"), 'import { test } from "bun:test";\n')),
      lane().runner,
    );
    expect(gone.result.verified).toBe(false);
    const note = texts(gone.events).find((t) => t.startsWith("Verify gate: not verified:"))!;
    expect(note).toContain('3 test(s) were deleted or turned off');
    for (const n of ["posix paths", "finds git", "parked"]) expect(note).toContain(`"${n}" (tests/gated.test.ts)`);
  });

  test("renaming or moving a test file, and moving a test to another file, keep the names: verified", async () => {
    const dir = makeRepo(tempBase());
    const { result } = await run(
      dir,
      editing(dir, () => {
        mkdirSync(join(dir, "spec"));
        renameSync(join(dir, "tests/math.test.ts"), join(dir, "spec/arith.test.ts"));
      }),
      lane().runner,
    );
    expect(result.verified).toBe(true);

    const other = makeRepo(tempBase());
    gitIn(other, "mv", "tests/math.test.ts", "tests/sum.test.ts");
    gitIn(other, "commit", "-q", "-m", "rename");
    const moved = await run(
      other,
      editing(other, () => {
        writeFileSync(
          join(other, "tests/sum.test.ts"),
          'import { expect, test } from "bun:test";\ntest("adds numbers", () => expect(1 + 1).toBe(2));\n',
        );
        writeFileSync(
          join(other, "tests/order.test.ts"),
          'import { expect, test } from "bun:test";\ntest("keeps order", () => expect([1]).toEqual([1]));\n',
        );
      }),
      lane().runner,
    );
    expect(moved.result.verified).toBe(true);
  });

  test("a deletion committed through a shell is seen (HEAD moved)", async () => {
    const dir = makeRepo(tempBase());
    const { result, events } = await run(
      dir,
      editing(dir, () => {
        writeFileSync(join(dir, "tests/math.test.ts"), SUITE.replace('test("adds numbers", () => expect(1 + 1).toBe(2));\n', ""));
        gitIn(dir, "commit", "-q", "-am", "trim");
      }),
      lane().runner,
    );
    expect(result.verified).toBe(false);
    expect(texts(events).join("\n")).toContain('"adds numbers" (tests/math.test.ts)');
  });

  test("a test file dirty before the run is compared with its start text, and left alone it is not re-read", async () => {
    const dir = makeRepo(tempBase());
    // Dirty before the run: an extra test not in HEAD.
    writeFileSync(join(dir, "tests/math.test.ts"), `${SUITE}test("local only", () => {});\n`);
    const untouched = await run(dir, editing(dir), lane().runner);
    expect(untouched.result.verified).toBe(true);

    const deleted = await run(
      dir,
      editing(dir, () => writeFileSync(join(dir, "tests/math.test.ts"), SUITE)),
      lane().runner,
    );
    expect(deleted.result.verified).toBe(false);
    expect(texts(deleted.events).join("\n")).toContain('"local only" (tests/math.test.ts)');
  });

  test("across the repo root: a run in a subdirectory still sees a test deleted outside it", async () => {
    const dir = makeRepo(tempBase());
    mkdirSync(join(dir, "pkg"));
    writeFileSync(join(dir, "pkg/lib.ts"), "export const y = 1;\n");
    gitIn(dir, "add", "pkg/lib.ts");
    gitIn(dir, "commit", "-q", "-m", "pkg");
    const cwd = join(dir, "pkg");
    const { result, events } = await run(
      cwd,
      async () => {
        writeFileSync(join(cwd, "lib.ts"), "export const y = 2;\n");
        unlinkSync(join(dir, "tests/math.test.ts"));
        return { summary: "edited", filesChanged: ["lib.ts"] };
      },
      lane().runner,
    );
    expect(result.filesChanged).toEqual(["lib.ts"]);
    expect(result.verified).toBe(false);
    expect(texts(events).join("\n")).toContain('"keeps order" (tests/math.test.ts)');
  });

  test("a carried talk: a test deleted by a run that ended blocked makes later turns re-run the lane and stay unverified", async () => {
    const talk = await makeTalk(tempBase());
    writeFileSync(join(talk.work, "app.test.ts"), 'import { test } from "bun:test";\ntest("app works", () => {});\n');
    gitIn(talk.work, "add", "app.test.ts");
    gitIn(talk.work, "commit", "-q", "-m", "add test");
    // The base branch has the test too, so the talk's merge-base holds it.
    gitIn(talk.project, "update-ref", "refs/heads/main", gitIn(talk.work, "rev-parse", "HEAD").trim());
    const first = await run(
      talk.work,
      async () => {
        unlinkSync(join(talk.work, "app.test.ts"));
        return { summary: "Needs your input", filesChanged: [], ask: { reason: "clarify", question: "ok?" } };
      },
      lane().runner,
    );
    expect(first.result.state).toBe("blocked");
    for (let turn = 0; turn < 2; turn++) {
      const v = lane();
      const later = await run(talk.work, async () => ({ summary: "just answered", filesChanged: [] }), v.runner);
      expect(v.calls).toEqual([talk.work]);
      expect(later.result.verified).toBe(false);
      expect(texts(later.events).join("\n")).toContain('"app works" (app.test.ts)');
    }
  });

  test("a tracker whose baseline git cannot give fails closed", async () => {
    const talk = await makeTalk(tempBase());
    gitIn(talk.project, "branch", "-m", "main", "trunk");
    settleTalkVerified(talk.gitDir, false);
    const tracker = await workspaceDiff.startWorkspaceDiff(talk.work);
    expect(tracker?.carried).toBe(true);
    expect(await tracker!.testDrops()).toBeNull();
    const from = await workspaceDiff.startWorkspaceDiffFrom(talk.work, "0000000000000000000000000000000000000000");
    expect(await from!.testDrops()).toBeNull();
  });
});

describe("a project with no git work tree walks its test files (REQ-agent-185, REQ-agent-502)", () => {
  function plain(): string {
    const dir = join(tempBase(), "plain");
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "tests/math.test.ts"), SUITE);
    return dir;
  }

  test("a test deleted in a non-git project is named; renaming the file is not a deletion", async () => {
    const dir = plain();
    const gone = await run(
      dir,
      async () => {
        writeFileSync(join(dir, "tests/math.test.ts"), SUITE.replace('test("keeps order"', 'test.skip("keeps order"'));
        return { summary: "edited", filesChanged: ["tests/math.test.ts"] };
      },
      lane().runner,
    );
    expect(gone.result.verified).toBe(false);
    expect(texts(gone.events).join("\n")).toContain('"keeps order" (tests/math.test.ts)');

    const dir2 = plain();
    const renamed = await run(
      dir2,
      async () => {
        renameSync(join(dir2, "tests/math.test.ts"), join(dir2, "tests/arith.test.ts"));
        return { summary: "renamed", filesChanged: ["tests/arith.test.ts"] };
      },
      lane().runner,
    );
    expect(renamed.result.verified).toBe(true);
  });

  test("a walk over its entry cap cannot tell, so it fails closed", async () => {
    const dir = plain();
    for (let i = 0; i < 5; i++) writeFileSync(join(dir, `f${i}.txt`), "x");
    expect(await startTestNameWalk(dir, 3).testDrops()).toBeNull();
    expect(await startTestNameWalk(dir).testDrops()).toEqual([]);
    const missing = startTestNameWalk(join(dir, "nope"));
    expect(await missing.testDrops()).toBeNull();
  });
});

describe("the real CLI (REQ-agent-185)", () => {
  function fakeFledge(base: string, body: string): { bin: string; calls: string } {
    const bin = join(base, "bin");
    mkdirSync(bin);
    const calls = join(base, "fledge.calls");
    writeFileSync(join(bin, "fledge"), `#!/bin/sh\necho "$*" >> '${calls}'\n${body}\n`);
    chmodSync(join(bin, "fledge"), 0o755);
    return { bin, calls };
  }

  async function cli(cwd: string, bin: string): Promise<{ code: number; result: TaskResult }> {
    const proc = Bun.spawn(["bun", join(root, "src/cli.ts"), "task", "run", "--task", "demo", "--json"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        CORVIDINHO_LLM_API_KEY: "",
        OPENAI_API_KEY: "",
        CORVIDINHO_DELEGATE_DEPTH: "",
      },
    });
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
    return { code, result: (JSON.parse(out) as { result: TaskResult }).result };
  }

  test("a lane that exits 0 with no test summary is not verified; one that prints a bun test summary is", async () => {
    for (const [body, verified] of [
      ["echo 'all good'\nexit 0", false],
      ["printf ' 4 pass\\n 0 fail\\nRan 4 tests across 1 file. [1.00ms]\\n' >&2\nexit 0", true],
    ] as const) {
      const base = tempBase();
      const talk = await makeTalk(base);
      writeFileSync(join(talk.work, "app.ts"), "export const x = 3;\n");
      settleTalkVerified(talk.gitDir, false);
      const f = fakeFledge(base, body);
      const { code, result } = await cli(talk.work, f.bin);
      expect(readFileSync(f.calls, "utf8")).toContain("lanes run verify --non-interactive");
      expect(result.verified).toBe(verified);
      expect(code).toBe(verified ? 0 : 1);
      expect(result.state).toBe(verified ? "done" : "failed");
    }
  }, 60_000);
});

describe("/work checks the tree against the merge-base before commit and push (REQ-discord-185)", () => {
  type Fixture = { repo: string; bare: string; wt: string; branch: string };

  function makeWork(): Fixture {
    const base = tempBase();
    const repo = makeRepo(base);
    const bare = join(base, "remote", "acme", "widget.git");
    mkdirSync(bare, { recursive: true });
    gitIn(bare, "init", "-q", "--bare");
    gitIn(repo, "remote", "add", "origin", bare);
    gitIn(repo, "push", "-q", "origin", "main");
    gitIn(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    const branch = "talk/sess_evidence01";
    const wt = join(base, "wt");
    gitIn(repo, "worktree", "add", "-q", "-b", branch, wt);
    return { repo, bare, wt, branch };
  }

  function remoteHas(bare: string, branch: string): boolean {
    return Bun.spawnSync(["git", "rev-parse", "--verify", "-q", `refs/heads/${branch}`], { cwd: bare }).exitCode === 0;
  }

  const calls: string[] = [];
  const plugins = async (opts: { name: string }): Promise<PluginHandlerResult> => {
    calls.push(opts.name);
    return { ok: true, exitCode: 0, data: { number: 9, url: "https://github.com/acme/widget/pull/9" } };
  };
  const deps = (verify: VerifyRunner) => ({
    runPlugin: plugins,
    allowlist: new Set<string>(WORK_PR_PLUGINS),
    repoGate: () => ({ ok: true as const, repo: "acme/widget" }),
    verify,
  });

  test("a test deleted in an earlier commit on the branch keeps the PR from opening and names it", async () => {
    const fx = makeWork();
    writeFileSync(join(fx.wt, "tests/math.test.ts"), SUITE.replace('test("keeps order", () => expect([1, 2]).toEqual([1, 2]));\n', ""));
    gitIn(fx.wt, "-c", "user.name=Fixture Bot", "-c", "user.email=fixture@example.invalid", "commit", "-q", "-am", "trim");
    writeFileSync(join(fx.wt, "app.ts"), "export const x = 5;\n");
    calls.length = 0;
    const v = lane();
    const r = await openWorkPr(
      {
        worktreePath: fx.wt,
        branch: fx.branch,
        taskId: "w1",
        description: "tidy",
        run: { ok: true, exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } },
      },
      deps(v.runner),
    );
    expect(r.opened).toBe(false);
    if (r.opened) return;
    expect(r.reason).toBe("tests-deleted");
    expect(r.line).toContain('1 test(s) were deleted or turned off since the branch left `main`');
    expect(r.line).toContain('"keeps order" (tests/math.test.ts)');
    expect(calls).toEqual([]);
    expect(v.calls).toEqual([]);
    expect(remoteHas(fx.bare, fx.branch)).toBe(false);
  });

  test("a renamed test file opens the PR; a pre-push lane with no test summary does not", async () => {
    const fx = makeWork();
    gitIn(fx.wt, "mv", "tests/math.test.ts", "tests/arith.test.ts");
    calls.length = 0;
    const input = {
      worktreePath: fx.wt,
      branch: fx.branch,
      taskId: "w2",
      description: "rename",
      run: { ok: true, exitCode: 0, task: { verified: false, verifySkipped: true, state: "done" } },
    };
    const quiet = await openWorkPr(input, deps(lane(["typecheck ok"]).runner));
    expect(quiet.opened).toBe(false);
    if (!quiet.opened) {
      expect(quiet.reason).toBe("verify-failed");
      expect(quiet.line).toContain("printed no test summary Corvidinho recognises");
    }
    expect(calls).toEqual([]);
    const ok = await openWorkPr(input, deps(lane().runner));
    expect(ok).toMatchObject({ opened: true, verify: "pre-push" });
    expect(calls).toEqual(["git-commit", "git-push", "github-pr-create"]);
  });
});
