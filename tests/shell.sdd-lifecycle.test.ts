/**
 * AGENT-18.a (REQ-plugins-1818): `shell-exec` never approves, reviews or
 * finalizes a SpecSync change, in any repo. On Corvidinho the run's own
 * settle step does that through the SpecSync plugin, which spawns `specsync`
 * itself (REQ-agent-519); everywhere else a human does.
 *
 * Temp dirs, never this checkout; a fake `specsync` on PATH that logs its
 * argv and does what the real one would to the change folder (approve writes
 * approvals.json, review writes review.json, finalize / ship archive it), and
 * fake `bunx` / `npx` that log and run it. Every refused command starts with
 * `touch spawned` and every script writes the marker first: a refusal must
 * spawn nothing. Imports come only from modules the base has; the new
 * module is imported inside its own tests.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  beginSddRun,
  endSddRun,
  HUMAN_LIFECYCLE_LINE,
  selfLifecycleRefusal,
  setCorvidinhoCheckoutForTests,
} from "../src/agent/repo-ways.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { shellProdWhy } from "../plugins/shell/must-ask.ts";
import { gitIn } from "./fixtures/talk-worktree.ts";

const bases: string[] = [];
function tempBase(): string {
  const b = mkdtempSync(join(tmpdir(), "corvidinho-sdd-shell-"));
  bases.push(b);
  return b;
}

const SDD_ON = {
  version: 2,
  enabled: true,
  require_change_for_meaningful_files: true,
  meaningful_paths: ["src/", "tests/"],
  ignored_paths: ["specs/", ".specsync/changes/", ".specsync/archive/"],
};

/** Fake `specsync`: logs argv + cwd, and changes the change folder like the real one. */
const FAKE_SPECSYNC = (log: string) => `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args }) + "\\n");
const at = args.indexOf("change");
const sub = at >= 0 ? args[at + 1] : args[0];
const id = at >= 0 ? args[at + 2] || "" : "";
const dir = path.join(".specsync", "changes", id);
if (at >= 0 && id && fs.existsSync(dir)) {
  if (sub === "approve") fs.writeFileSync(path.join(dir, "approvals.json"), "[{\\"actor\\":\\"x\\"}]");
  if (sub === "review") fs.writeFileSync(path.join(dir, "review.json"), "{\\"reviewer\\":\\"x\\"}");
  if (sub === "finalize" || sub === "ship") {
    fs.mkdirSync(path.join(".specsync", "archive", "changes"), { recursive: true });
    fs.renameSync(dir, path.join(".specsync", "archive", "changes", "2026-10-06-" + id));
  }
}
console.log("ok " + (sub || ""));
`;

/** Fake package runner: logs, then runs the named package's bin (the fake specsync). */
const FAKE_RUNNER = (name: string, log: string, bin: string) => `#!/bin/sh
echo "${name} $*" >> ${JSON.stringify(log)}
while [ $# -gt 0 ]; do
  case "$1" in
    -*) shift ;;
    x) shift ;;
    *) shift; exec ${JSON.stringify(bin)} "$@" ;;
  esac
done
`;

let fakeBin = "";
let specsyncLog = "";
let runnerLog = "";
const savedPath = process.env.PATH;

beforeAll(() => {
  fakeBin = join(tempBase(), "bin");
  mkdirSync(fakeBin, { recursive: true });
  specsyncLog = join(fakeBin, "specsync.log");
  runnerLog = join(fakeBin, "runner.log");
  writeFileSync(join(fakeBin, "specsync"), FAKE_SPECSYNC(specsyncLog));
  chmodSync(join(fakeBin, "specsync"), 0o755);
  for (const name of ["bunx", "npx"]) {
    writeFileSync(join(fakeBin, name), FAKE_RUNNER(name, runnerLog, join(fakeBin, "specsync")));
    chmodSync(join(fakeBin, name), 0o755);
  }
  process.env.PATH = `${fakeBin}:${savedPath ?? "/usr/bin:/bin"}`;
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  setCorvidinhoCheckoutForTests(null);
  rmSync(specsyncLog, { force: true });
  rmSync(runnerLog, { force: true });
});

afterAll(() => {
  process.env.PATH = savedPath;
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

/** A git repo with the SpecSync workflow on and change `c1` open (as `specsync change new` leaves it). */
function sddRepo(): string {
  const repo = join(tempBase(), "repo");
  mkdirSync(join(repo, ".specsync", "changes", "c1"), { recursive: true });
  mkdirSync(join(repo, "src"), { recursive: true });
  gitIn(repo, "init", "-q", "-b", "main");
  gitIn(repo, "config", "user.name", "Fixture Bot");
  gitIn(repo, "config", "user.email", "fixture@example.invalid");
  gitIn(repo, "config", "commit.gpgsign", "false");
  writeFileSync(join(repo, ".specsync", "sdd.json"), JSON.stringify(SDD_ON));
  writeFileSync(
    join(repo, ".specsync", "changes", "c1", "state.json"),
    JSON.stringify({ id: "c1", state: "draft", affected_paths: ["src/app.ts"] }),
  );
  writeFileSync(join(repo, "src", "app.ts"), "export const x = 1;\n");
  gitIn(repo, "add", "-A");
  gitIn(repo, "commit", "-q", "-m", "init");
  return repo;
}

/** A temp repo that plays Corvidinho itself: origin CorvidLabs/Corvidinho, named as this checkout. */
function corvidinhoRepo(): string {
  const repo = sddRepo();
  gitIn(repo, "remote", "add", "origin", "https://github.com/CorvidLabs/Corvidinho.git");
  setCorvidinhoCheckoutForTests(repo);
  return repo;
}

/** A plain folder: no git, no SpecSync. */
function plainDir(): string {
  const dir = join(tempBase(), "plain");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Every file under `.specsync/` with its bytes and mode. */
function specsyncTree(repo: string): Record<string, string> {
  const out: Record<string, string> = {};
  const root = join(repo, ".specsync");
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(repo, p)] = `${statSync(p).mode}:${readFileSync(p, "utf8")}`;
    }
  };
  walk(root);
  return out;
}

function logged(path: string): string[] {
  return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : [];
}

const run = (command: string, cwd: string) =>
  runPlugin({
    name: "shell-exec",
    args: ["--command", command],
    cwd,
    nonInteractive: true,
    allowlist: ["shell-exec"],
  });

type Refused = { refused?: boolean; rule?: string; step?: string | null; script?: string | null };

/** `shell-exec` refused `command` in `cwd` for AGENT-18.a, and nothing ran or changed. */
async function expectRefused(command: string, cwd: string, step: string | null, script: string | null = null) {
  const before = specsyncTree(cwd);
  const result = await run(command, cwd);
  const msg = result.error ?? "";
  expect({ command, ok: result.ok, exitCode: result.exitCode }).toEqual({ command, ok: false, exitCode: 2 });
  expect(msg).toStartWith("shell-exec refused (AGENT-18.a): ");
  expect(msg).toContain(HUMAN_LIFECYCLE_LINE.replace(/^refused: /, ""));
  expect(msg).toContain("never does in any repo");
  const data = result.data as Refused | undefined;
  expect(data?.refused).toBe(true);
  expect(data?.rule).toBe("AGENT-18.a");
  expect(data?.step ?? null).toBe(step);
  expect(data?.script ?? null).toBe(script);
  if (script) expect(msg).toContain(`(in ${script})`);
  // Nothing spawned: no marker, no specsync or runner call, the change folder untouched.
  expect(existsSync(join(cwd, "spawned"))).toBe(false);
  expect(logged(specsyncLog)).toEqual([]);
  expect(logged(runnerLog)).toEqual([]);
  expect(specsyncTree(cwd)).toEqual(before);
  expect(existsSync(join(cwd, ".specsync", "archive"))).toBe(false);
  for (const f of ["approvals.json", "review.json"]) {
    expect(existsSync(join(cwd, ".specsync", "changes", "c1", f))).toBe(false);
  }
}

describe("shell-exec refuses specsync change approve / review / finalize / ship in every repo (AGENT-18.a, REQ-plugins-1818)", () => {
  const direct: [string, string][] = [
    ["touch spawned; specsync change approve c1 --actor leif", "approve"],
    ["touch spawned; specsync change review c1 --reviewer leif", "review"],
    ["touch spawned; specsync change finalize c1", "finalize"],
    ["touch spawned; specsync change ship c1", "ship"],
  ];

  test("in a SpecSync repo: exit 2 naming AGENT-18.a with HUMAN_LIFECYCLE_LINE; nothing spawned, nothing approved or archived", async () => {
    const repo = sddRepo();
    for (const [command, step] of direct) await expectRefused(command, repo, step);
  });

  test("in a plain folder (no git, no SpecSync): refused the same, with no repo check", async () => {
    const dir = plainDir();
    for (const [command, step] of direct) await expectRefused(command, dir, step);
  });

  test("on Corvidinho, even for this run's own change right after a green lane: the shell still refuses", async () => {
    const repo = corvidinhoRepo();
    const ledger = beginSddRun(repo);
    try {
      ledger.opened.push("c1");
      ledger.verified = true;
      // The settle gate would let the plugin approve c1 now ...
      expect(await selfLifecycleRefusal(repo, "c1", {})).toBeNull();
      // ... but never through the shell.
      for (const [command, step] of direct) await expectRefused(command, repo, step);
    } finally {
      endSddRun(ledger);
    }
  });

  test("through sh -c / bash -c, eval, $(…), backticks, functions and control flow", async () => {
    const repo = sddRepo();
    for (const [command, step] of [
      ["touch spawned; sh -c 'specsync change approve c1 --actor x'", "approve"],
      ["touch spawned; bash -c \"specsync change review c1 --reviewer x\"", "review"],
      ["touch spawned; eval 'specsync change finalize c1'", "finalize"],
      ["touch spawned; echo $(specsync change ship c1)", "ship"],
      ["touch spawned; echo `specsync change approve c1`", "approve"],
      ["touch spawned; f() { specsync change approve c1; }; f", "approve"],
      ["touch spawned; if true; then specsync change approve c1; fi", "approve"],
      ["touch spawned; true && specsync change approve c1 | cat", "approve"],
      ["touch spawned; specsync change appr\\ove c1", "approve"],
      ["touch spawned; specsync change 'fin'alize c1", "finalize"],
      // dash reads `$'…'` as an expansion (the step can't be read), bash as `approve`: refused either way.
      ["touch spawned; specsync change $'approve' c1", null],
    ] as const) {
      await expectRefused(command, repo, step);
    }
  });

  test("behind env / timeout / nohup / xargs / sudo, a path to the binary, bunx / npx and SpecSync's own options", async () => {
    const repo = sddRepo();
    mkdirSync(join(repo, "tools"));
    copyFileSync(join(fakeBin, "specsync"), join(repo, "tools", "specsync"));
    chmodSync(join(repo, "tools", "specsync"), 0o755);
    mkdirSync(join(repo, "bin"));
    symlinkSync(join(fakeBin, "specsync"), join(repo, "bin", "ss"));
    for (const [command, step] of [
      ["touch spawned; env X=1 specsync change approve c1", "approve"],
      ["touch spawned; timeout 5 specsync change approve c1", "approve"],
      ["touch spawned; nohup specsync change approve c1", "approve"],
      ["touch spawned; echo c1 | xargs specsync change approve", "approve"],
      ["touch spawned; sudo -u root specsync change approve c1", "approve"],
      ["touch spawned; exec specsync change approve c1", "approve"],
      ["touch spawned; command specsync change approve c1", "approve"],
      ["touch spawned; find . -name app.ts -exec specsync change approve c1 \\;", "approve"],
      [`touch spawned; ${join(fakeBin, "specsync")} change approve c1`, "approve"],
      ["touch spawned; ./tools/specsync change review c1", "review"],
      ["touch spawned; cd tools && ../tools/specsync change finalize c1", "finalize"],
      ["touch spawned; ./bin/ss change approve c1", "approve"],
      ["touch spawned; bunx specsync change approve c1", "approve"],
      ["touch spawned; npx -y specsync@6.0.0 change ship c1", "ship"],
      ["touch spawned; specsync --format json change approve c1", "approve"],
      ["touch spawned; specsync --root . change --strict approve c1", "approve"],
      ["touch spawned; specsync change --format json finalize c1", "finalize"],
      ["touch spawned; $S change approve c1", "approve"],
    ] as const) {
      await expectRefused(command, repo, step);
    }
  });

  test("a step it cannot read refuses: one that expands, or one xargs fills in from input", async () => {
    const repo = sddRepo();
    for (const command of [
      'touch spawned; S=approve; specsync change "$S" c1',
      "touch spawned; specsync change $(echo approve) c1",
      "touch spawned; echo approve c1 | xargs specsync change",
      "touch spawned; echo approve | xargs -I X specsync change X c1",
    ]) {
      await expectRefused(command, repo, null);
    }
  });

  test("in an in-root script the command runs in a shell, naming the script", async () => {
    const repo = sddRepo();
    writeFileSync(join(repo, "x.sh"), "touch spawned\nspecsync change approve c1 --actor someone\n");
    writeFileSync(join(repo, "y.sh"), "#!/bin/sh\ntouch spawned\nspecsync change review c1 --reviewer someone\n");
    chmodSync(join(repo, "y.sh"), 0o755);
    await expectRefused("sh x.sh", repo, "approve", "x.sh");
    await expectRefused("bash ./x.sh", repo, "approve", "./x.sh");
    await expectRefused(". ./x.sh", repo, "approve", "./x.sh");
    await expectRefused("./y.sh", repo, "review", "./y.sh");
  });

  test("read-only steps still run: change status / list / show / check / ship-status and specsync check", async () => {
    const repo = sddRepo();
    const before = specsyncTree(repo);
    for (const command of [
      "specsync change status c1",
      "specsync change list",
      "specsync change show c1",
      "specsync change check c1",
      "specsync change ship-status",
      "specsync check",
      "specsync check --require-coverage 100",
      "specsync change --format json status c1",
      "echo c1 | xargs specsync change status",
    ]) {
      const result = await run(command, repo);
      expect({ command, ok: result.ok, exitCode: result.exitCode }).toEqual({ command, ok: true, exitCode: 0 });
    }
    const calls = logged(specsyncLog).map((l) => (JSON.parse(l) as { args: string[] }).args.join(" "));
    expect(calls).toEqual([
      "change status c1",
      "change list",
      "change show c1",
      "change check c1",
      "change ship-status",
      "check",
      "check --require-coverage 100",
      "change --format json status c1",
      "change status c1",
    ]);
    expect(specsyncTree(repo)).toEqual(before);
    // Words that only mention a step are not a step.
    for (const command of [
      "echo approve review finalize ship",
      "grep -rn 'specsync change approve' . || true",
      "specsync change new 'approve the plan' --kind feature",
      "specsync change answer c1 acceptance_criteria 'AGENT-18.a: review it'",
    ]) {
      const result = await run(command, repo);
      expect({ command, ok: result.ok }).toEqual({ command, ok: true });
    }
  });

  test("the owner gets no Approve card for a command the check refuses (AUTONOMY-9 skips it)", () => {
    const repo = sddRepo();
    expect(shellProdWhy("kubectl get pods", repo, { env: {} })).not.toBeNull();
    expect(shellProdWhy("specsync change approve c1 && kubectl get pods", repo, { env: {} })).toBeNull();
  });

  test("the settle path is untouched: the SpecSync plugin spawns specsync itself on Corvidinho (REQ-agent-519)", async () => {
    const repo = corvidinhoRepo();
    const ledger = beginSddRun(repo);
    try {
      ledger.opened.push("c1");
      ledger.verified = true;
      const approved = await runPlugin({
        name: "specsync-change-approve",
        args: ["c1"],
        cwd: repo,
        nonInteractive: true,
        allowlist: ["specsync-change-approve"],
      });
      expect(approved.ok).toBe(true);
      const calls = logged(specsyncLog).map((l) => (JSON.parse(l) as { args: string[] }).args);
      expect(calls).toEqual([["change", "approve", "c1", "--actor", "corvid-agent"]]);
      expect(existsSync(join(repo, ".specsync", "changes", "c1", "approvals.json"))).toBe(true);
    } finally {
      endSddRun(ledger);
    }
  });
});

describe("firstLifecycleStep reads the step past options and fails closed (REQ-plugins-1818)", () => {
  test("steps, option values, expansions and xargs input", async () => {
    const { firstLifecycleStep } = await import("../plugins/shell/sdd-lifecycle.ts");
    const root = plainDir();
    const step = (c: string) => firstLifecycleStep(c, root)?.step;
    const found = (c: string) => firstLifecycleStep(c, root) != null;
    expect(step("specsync change approve c1")).toBe("approve");
    expect(step("specsync --root change change review c1")).toBe("review");
    expect(step("specsync change --note approve status")).toBe("approve"); // may be the value: counts
    expect(step("cargo run --bin specsync -- change finalize c1")).toBe("finalize");
    expect(step("cargo run --bin=specsync -- change finalize c1")).toBe("finalize");
    expect(step("sh <<'EOF'\nspecsync change approve c1\nEOF")).toBe("approve");
    expect(step("watch -n 5 specsync change review c1")).toBe("review"); // a wrapper the chain doesn't know
    expect(found("specsync-helper change approve")).toBe(false);
    expect(step("pnpm dlx @corvidlabs/specsync@6 change ship c1")).toBe("ship");
    expect(step('specsync change "$S" c1')).toBeNull();
    expect(found('specsync change "$S" c1')).toBe(true);
    expect(found("$EDITOR change review")).toBe(true); // an expanding command word may be specsync
    expect(found('$X change "$Y"')).toBe(false); // ... but only a literal step refuses then
    expect(found("specsync change")).toBe(false);
    expect(found("specsync change status")).toBe(false);
    expect(found("specsync change ship-status c1")).toBe(false);
    expect(found("specsync check change approve")).toBe(false); // `check` is the subcommand
    expect(found("echo specsync change approve")).toBe(true); // fails closed on the words
    expect(found("echo specsync; echo change approve")).toBe(false);
    expect(found("bun -e 'Bun.spawnSync([\"specsync\",\"change\",\"approve\",\"c1\"])'")).toBe(false); // stated residual
  });
});

describe("glob / brace patterns and an expanding or xargs-fed subcommand refuse too (REQ-plugins-1818, follow-up to #372)", () => {
  test("a pattern that may be specsync, change or a step refuses, run from a folder holding files named for them", async () => {
    const repo = sddRepo();
    // What the shell's pathname expansion turns the patterns into.
    for (const f of ["specsync", "change", "approve"]) writeFileSync(join(repo, f), "");
    for (const [command, step] of [
      ["touch spawned; spec*ync change approve c1", "approve"],
      ["touch spawned; specsyn? change review c1", "review"],
      ["touch spawned; [s]pecsync change finalize c1", "finalize"],
      ["touch spawned; env spec* change approve c1", "approve"],
      ["touch spawned; bunx spec* change ship c1", "ship"],
      ["touch spawned; specsync c?ange approve c1", null],
      ["touch spawned; specsync change appr*ve c1", null],
      ["touch spawned; specsync change appro?e c1", null],
      ["touch spawned; specsync change [a]pprove c1", null],
      ["touch spawned; bash -c 'specsync change {approve,} c1'", null],
      ["touch spawned; bash -c '{specsync,} change approve c1'", "approve"],
    ] as const) {
      await expectRefused(command, repo, step);
    }
  });

  test("a subcommand that expands (forwarded arguments, set --, an IFS-joined word) or that xargs supplies refuses", async () => {
    const repo = sddRepo();
    for (const command of [
      'touch spawned; f() { specsync "$@"; }; f change approve c1',
      'touch spawned; set -- change approve c1; specsync "$@"',
      "touch spawned; specsync change${IFS}approve c1",
      "touch spawned; S='change approve'; specsync $S c1",
      "touch spawned; echo change approve c1 | xargs specsync",
      "touch spawned; echo change approve c1 | xargs -n3 specsync",
      "touch spawned; echo change | xargs -I X specsync X approve c1",
    ]) {
      await expectRefused(command, repo, null);
    }
  });

  test("firstLifecycleStep: patterns, expanding subcommands and xargs input fail closed; ordinary commands are untouched", async () => {
    const { firstLifecycleStep } = await import("../plugins/shell/sdd-lifecycle.ts");
    const root = plainDir();
    const read = (c: string) => {
      const f = firstLifecycleStep(c, root);
      return f && { step: f.step, unread: f.unread };
    };
    // The program name as a pattern: read like `specsync`.
    expect(read("spec*ync change approve c1")).toEqual({ step: "approve", unread: null });
    expect(read("./specsyn? change approve c1")).toEqual({ step: "approve", unread: null });
    expect(read("/usr/bin/[s]pecsync change review c1")).toEqual({ step: "review", unread: null });
    expect(read("spec{sync,} change finalize c1")).toEqual({ step: "finalize", unread: null });
    expect(read("{x,specsync} change ship c1")).toEqual({ step: "ship", unread: null });
    expect(read("npx spec*@6 change approve c1")).toEqual({ step: "approve", unread: null });
    expect(read("cargo run --bin=spec* -- change approve c1")).toEqual({ step: "approve", unread: null });
    expect(read("* change approve c1")).toEqual({ step: "approve", unread: null });
    // The step or `change` as a pattern.
    const stepPattern = { step: null, unread: "its step is a pattern the shell expands" };
    for (const c of [
      "specsync change appr*ve c1",
      "specsync change appro?e c1",
      "specsync change [a]pprove c1",
      "specsync change [[:alpha:]]pprove c1",
      "specsync change [!x]eview c1",
      "specsync change {approve,x} c1",
      "specsync change fin{alize,} c1",
      "specsync change {a..z}pprove c1",
      "specsync change sh?p c1",
      "specsync change ?????? c1",
      "specsync change --note {x,approve} status",
      "$X change appr*ve c1",
      "sh -c 'specsync change appr*ve c1'",
      "eval specsync change appr\\*ve c1",
    ]) {
      expect({ c, r: read(c) }).toEqual({ c, r: stepPattern });
    }
    expect(read("$X ch*nge approve c1")).toEqual({ step: "approve", unread: null });
    const subPattern = { step: null, unread: "its subcommand is a pattern the shell expands" };
    expect(read("specsync ch?nge approve c1")).toEqual(subPattern);
    expect(read("specsync {change,approve} c1")).toEqual(subPattern);
    expect(read("specsync --root {.,change} approve c1")).toEqual(subPattern);
    // An expanding subcommand, or one xargs supplies.
    const subExpands = { step: null, unread: "its subcommand expands" };
    for (const c of [
      'f() { specsync "$@"; }; f change approve c1',
      'function f { specsync "$@"; }; f change approve c1',
      'f() { specsync "$1" "$2" c1; }; f change approve',
      'set -- change approve c1; specsync "$@"',
      "specsync change${IFS}approve c1",
      "specsync $SUB approve c1",
      'specsync --verbose "$@"',
      'bunx specsync "$@"',
    ]) {
      expect({ c, r: read(c) }).toEqual({ c, r: subExpands });
    }
    const xargsSupplies = { step: null, unread: "xargs supplies its subcommand from input" };
    expect(read("echo change approve c1 | xargs specsync")).toEqual(xargsSupplies);
    expect(read("echo change approve c1 | xargs -n3 specsync")).toEqual(xargsSupplies);
    expect(read("echo change approve c1 | xarg? specsync")).toEqual(xargsSupplies);
    expect(read("echo change approve c1 | $X specsync")).toEqual(xargsSupplies); // `$X` may be xargs
    expect(read("echo approve c1 | xargs specsync --root .")).toEqual(xargsSupplies);
    // Words that only mention specsync still refuse on a literal `change` step.
    expect(read("grep specsync change appr*ve")).toEqual(stepPattern);
    expect(read("echo change | xargs -I X specsync X approve c1")).toEqual({
      step: null,
      unread: "xargs fills in its subcommand from input",
    });
    // Untouched: quoted pattern characters, wildcards away from a command
    // word, literal subcommands under xargs, and an expanding command word's
    // own arguments (only a literal step refuses there).
    for (const c of [
      "echo 'spec*ync change approve'",
      "echo spec\\*ync change approve",
      "echo \"specsync change appr*ve\"",
      "specsync change 'appr*ve' c1",
      'cp * "$dest"',
      'cp src/* "$dest"',
      'ls *.ts "$x"',
      "ls * specsync",
      "ls * | xargs grep -l specsync",
      "git ls-files | xargs grep -l specsync",
      'grep -rn specsync "$f"',
      "rg specsync $(git ls-files)",
      'echo specsync "$x"',
      "for f in *; do echo \"$f\"; done",
      "[ -f x ] && echo ok",
      'echo {a,b} "$x"',
      "specsync change new 'fix [x] *' --kind bug-fix",
      'specsync change answer c1 acceptance_criteria "a*b"',
      'specsync change status "$ID"',
      "specsync change {new,x} c1",
      "echo c1 | xargs specsync change status",
      "echo x | xargs specsync check",
      "echo x | xargs specsync --root . check",
      '$X "$Y"',
      '$X change "$Y"',
      "$X * c1",
    ]) {
      expect({ c, r: read(c) }).toEqual({ c, r: null });
    }
  });
});
