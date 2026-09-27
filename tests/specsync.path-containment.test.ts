/**
 * REQ-plugins-008 — SpecSync tools stay inside the project (SAFE-2 / PLUGIN-1).
 *
 * specsync-read / specsync-brief take a model-chosen module name. It must be a
 * plain module name, and every file they read must realpath inside the
 * project's specs dir (symlinks too). The spawn-backed tools refuse `--root`,
 * which would point the specsync binary at another directory.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createTaskExecute } from "../src/agent/index.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import {
  invalidModuleName,
  readCompanions,
  readModuleSpec,
  refuseRootArg,
} from "../plugins/specsync/api.ts";

const SECRET = "OUTSIDE-SECRET-7f3a";
const repoRoot = join(import.meta.dir, "..");

let dir = "";
let outside = "";

function put(path: string, content: string) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function run(name: string, args: string[], cwd = dir) {
  return runPlugin({ name, args, cwd, nonInteractive: true });
}

function expectRefused(
  r: { ok: boolean; exitCode?: number; error?: string; message?: string; data?: unknown },
  pattern: RegExp,
) {
  expect(r.ok).toBe(false);
  expect(r.exitCode).toBe(1);
  expect(r.error ?? "").toMatch(pattern);
  expect(r.error ?? "").not.toContain("\0");
  expect(JSON.stringify(r)).not.toContain(SECRET);
}

beforeEach(() => {
  clearRegistry();
  loadBuiltins();
  dir = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-specsync-proj-")));
  outside = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-specsync-out-")));
  put(join(dir, "specs", "good", "good.spec.md"), "---\nmodule: good\n---\n# Good spec\n");
  put(join(dir, "specs", "good", "context.md"), "good context\n");
  put(join(outside, "outside.md"), `${SECRET} flat\n`);
  put(join(outside, "other.md"), `${SECRET} other\n`);
  put(join(outside, "outside.spec.md"), `${SECRET} spec\n`);
  put(join(outside, "context.md"), `${SECRET} context\n`);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("module name validation (REQ-plugins-008)", () => {
  test("plain module names pass; everything else is refused", () => {
    for (const ok of ["agent", "cli", "plugins", "my-mod_2", "A1"]) {
      expect(invalidModuleName(ok)).toBeNull();
    }
    for (const bad of [
      "",
      ".",
      "..",
      "../x",
      "../../../../tmp/x",
      "/etc/passwd",
      "a/b",
      "a\\b",
      "good/../good",
      "good\0",
      "good.md",
      " good",
      "~",
    ]) {
      expect(invalidModuleName(bad)).toMatch(/invalid spec module name/);
    }
  });

  test("NUL is escaped in the error, never echoed raw", () => {
    const err = invalidModuleName("cli\0../../x") ?? "";
    expect(err).not.toContain("\0");
    expect(err).toContain("\\u0000");
  });
});

describe("specsync-read stays inside specs/ (REQ-plugins-008)", () => {
  test("a registered module still reads", async () => {
    const r = await run("specsync-read", ["good"]);
    expect(r.ok).toBe(true);
    expect(String(r.message)).toContain("# Good spec");
    const r2 = await run("specsync-read", ["name=good"]);
    expect(r2.ok).toBe(true);
  });

  test("relative traversal to a flat .md outside the project is refused", async () => {
    const rel = relative(join(dir, "specs"), join(outside, "outside"));
    expect(rel.startsWith("..")).toBe(true);
    expectRefused(await run("specsync-read", [rel]), /invalid spec module name/);
    expectRefused(await run("specsync-read", [`name=${rel}`]), /invalid spec module name/);
    // The reported repro: many ../ then the absolute outside path.
    expectRefused(
      await run("specsync-read", [`../../../../../../..${outside}/outside`]),
      /invalid spec module name/,
    );
  });

  test("absolute path, separators and NUL are refused", async () => {
    for (const bad of [join(outside, "outside"), "good/../good", "a\\b", "good\0", ".."]) {
      expectRefused(await run("specsync-read", [bad]), /invalid spec module name/);
    }
  });

  test("a spec file symlinked outside the project is refused", async () => {
    mkdirSync(join(dir, "specs", "evil"));
    symlinkSync(join(outside, "outside.spec.md"), join(dir, "specs", "evil", "evil.spec.md"));
    expectRefused(await run("specsync-read", ["evil"]), /outside the project specs dir/);
  });

  test("a module dir symlinked outside the project is refused", async () => {
    symlinkSync(outside, join(dir, "specs", "outside"));
    expectRefused(await run("specsync-read", ["outside"]), /outside the project specs dir/);
  });

  test("a flat legacy spec symlinked outside the project is refused", async () => {
    symlinkSync(join(outside, "outside.md"), join(dir, "specs", "flat.md"));
    expectRefused(await run("specsync-read", ["flat"]), /outside the project specs dir/);
  });

  test("a specs dir symlinked outside the project is refused", async () => {
    const proj = realpathSync(mkdtempSync(join(tmpdir(), "corvidinho-specsync-proj2-")));
    try {
      put(join(outside, "specs", "m", "m.spec.md"), `${SECRET} m\n`);
      symlinkSync(join(outside, "specs"), join(proj, "specs"));
      expectRefused(await run("specsync-read", ["m"], proj), /specs dir resolves outside/);
      expectRefused(await run("specsync-brief", ["m"], proj), /specs dir resolves outside/);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  test("a symlink that stays inside specs/ still reads", async () => {
    symlinkSync(join(dir, "specs", "good"), join(dir, "specs", "alias"));
    symlinkSync(
      join(dir, "specs", "good", "good.spec.md"),
      join(dir, "specs", "good", "alias.spec.md"),
    );
    mkdirSync(join(dir, "specs", "linked"));
    symlinkSync(
      join(dir, "specs", "good", "good.spec.md"),
      join(dir, "specs", "linked", "linked.spec.md"),
    );
    for (const name of ["alias", "linked"]) {
      const r = await run("specsync-read", [name]);
      expect(r.ok).toBe(true);
      expect(String(r.message)).toContain("# Good spec");
    }
    const b = await run("specsync-brief", ["alias"]);
    expect(b.ok).toBe(true);
    expect(String(b.message)).toContain("# Companion: alias/context.md");
  });

  test("a missing module is still a plain not-found error", async () => {
    const r = await run("specsync-read", ["nope"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("spec 'nope' not found");
  });
});

describe("specsync-brief stays inside specs/ (REQ-plugins-008)", () => {
  test("a registered module still briefs with companions", async () => {
    const r = await run("specsync-brief", ["good"]);
    expect(r.ok).toBe(true);
    expect(String(r.message)).toContain("# Spec: good");
    expect(String(r.message)).toContain("# Companion: good/context.md");
  });

  test("traversal to an outside dir is refused (no *.md dumped)", async () => {
    const rel = relative(join(dir, "specs"), outside);
    expectRefused(await run("specsync-brief", [rel]), /invalid spec module name/);
    expectRefused(
      await run("specsync-brief", [`../../../../../../..${outside}`]),
      /invalid spec module name/,
    );
    expectRefused(await run("specsync-brief", [outside]), /invalid spec module name/);
  });

  test("a module dir symlinked outside the project is refused", async () => {
    symlinkSync(outside, join(dir, "specs", "outside"));
    expectRefused(await run("specsync-brief", ["outside"]), /outside the project specs dir/);
  });

  test("a companion symlinked outside the project refuses the whole brief", async () => {
    symlinkSync(join(outside, "context.md"), join(dir, "specs", "good", "tasks.md"));
    expectRefused(await run("specsync-brief", ["good"]), /good\/tasks\.md resolves outside/);
  });

  test("an extra .md companion symlinked outside the project refuses the whole brief", async () => {
    symlinkSync(join(outside, "other.md"), join(dir, "specs", "good", "notes.md"));
    expectRefused(await run("specsync-brief", ["good"]), /good\/notes\.md resolves outside/);
  });

  test("readCompanions / readModuleSpec report the refusal to in-process callers", () => {
    symlinkSync(join(outside, "other.md"), join(dir, "specs", "good", "notes.md"));
    const c = readCompanions(dir, "good");
    expect(c.files).toEqual([]);
    expect(c.error).toMatch(/resolves outside/);
    const bad = readCompanions(dir, "../x");
    expect(bad.files).toEqual([]);
    expect(bad.error).toMatch(/invalid spec module name/);
    const s = readModuleSpec(dir, "../x");
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.refused).toBe(true);
  });
});

describe("spawn-backed SpecSync tools refuse --root (REQ-plugins-008)", () => {
  test("refuseRootArg catches both forms and nothing else", () => {
    expect(refuseRootArg(["--root", outside])).toMatch(/--root is not allowed/);
    expect(refuseRootArg([`--root=${outside}`])).toMatch(/--root is not allowed/);
    expect(refuseRootArg(["--format", "json"])).toBeNull();
    expect(refuseRootArg(["some-change-id"])).toBeNull();
  });

  for (const name of ["specsync-coverage", "specsync-change-list", "specsync-ship-status"]) {
    test(`${name} refuses --root before spawning specsync`, async () => {
      for (const args of [["--root", outside], [`--root=${outside}`], ["--json", "--root", outside]]) {
        const r = await run(name, args);
        expect(r.ok).toBe(false);
        expect(r.exitCode).toBe(1);
        expect(r.error).toBe(
          "refused: --root is not allowed; SpecSync tools run on this project only",
        );
      }
    });
  }
});

describe("CLI + tool loop repro (REQ-plugins-008)", () => {
  test("`corvidinho specsync read ../../..<outside>` refuses and prints nothing outside", async () => {
    const proc = Bun.spawn(
      ["bun", "src/cli.ts", "specsync", "read", `../../../../../../..${outside}/outside`],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const code = await proc.exited;
    const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
    expect(code).toBe(1);
    expect(out).toContain("invalid spec module name");
    expect(out).not.toContain(SECRET);
  });

  test("a model's specsync-read tool call cannot pull an outside file into the loop", async () => {
    const bodies: string[] = [];
    let call = 0;
    const rel = relative(join(dir, "specs"), join(outside, "outside"));
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      call += 1;
      bodies.push(String(init?.body ?? ""));
      const message =
        call === 1
          ? {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "specsync-read", arguments: JSON.stringify({ argv: [rel] }) },
                },
              ],
            }
          : { role: "assistant", content: "done" };
      return new Response(JSON.stringify({ choices: [{ message }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const exec = createTaskExecute({
      taskText: "read a spec",
      cwd: dir,
      env: {
        CORVIDINHO_LLM_API_KEY: "test-key",
        CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
        CORVIDINHO_LLM_MODEL: "test-model",
        CORVIDINHO_LLM_TIER: "tool",
      },
      fetchImpl,
      tier: "tool",
      projectInstructions: false,
      maxToolRounds: 3,
    });
    const r = await exec({ attempt: 1, signal: new AbortController().signal });
    expect(r.summary).toBe("done");
    expect(call).toBe(2);
    expect(bodies[1]).toContain("invalid spec module name");
    expect(bodies[1]).not.toContain(SECRET);
  });
});
