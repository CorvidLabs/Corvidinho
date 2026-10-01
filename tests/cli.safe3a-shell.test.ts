/**
 * SAFE-3.a, the local CLI half (#83, REQ-cli-681): "The model may use the
 * shell, the language runners and Fledge lane/task runs only in my own
 * interactive runs (chat, /session start, /work, local CLI), only when I
 * allowlist them, and only inside that talk's own worktree; non-owners, WATCH
 * and schedules never get them."
 *
 * A local `corvidinho task run` that made its own worktree
 * (SESSION-WORKTREE-1.a, REQ-cli-122) is offered the allowlisted shell,
 * runners and Fledge runs at code tier there, and they run there. `--here`, a
 * non-git folder, a subdirectory, any other directory, a spawned child (a
 * Discord session id or surface stamp without a role session), WATCH,
 * schedules and delegate workers are refused, with one operator line per
 * run. A prod command still raises the must-ask card; with no bridge running
 * nobody answers it, so it lapses (a no) and the run says why.
 *
 * Gate rows in-process (`shellToolsGate`), the tool loop in-process
 * (`createTaskExecute` with an injected provider), and the real CLI spawned
 * against a localhost fake model. Temp repos under the test run's temp root
 * only (never this checkout); every test removes the worktrees and
 * `talk/cli_*` branches it made. No network, no tokens.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { ACTING_SURFACE_ENV, isCliRunWorktree, shellToolsGate, TOOL_CHILD_ENV } from "../src/agent/shell-gate.ts";
import type { TaskResult } from "../src/agent/types.ts";
import { DELEGATE_DEPTH_ENV } from "../src/autonomous/delegate.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { MUST_ASK_PROD_KIND, setMustAskNotifier } from "../src/plugins/must-ask.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { enterCliTaskWorkspace, type CliTaskWorkspace } from "../src/worktree/cli-run.ts";
import { fledgeCoreChildEnv } from "../plugins/fledge/core.ts";
import { runnerChildEnv } from "../plugins/runners/commands.ts";
import { ensureTalkWorkspace } from "../src/worktree/manager.ts";
import { FAKE_LLM_ENV, startFakeLlm, type FakeReply } from "./fixtures/fake-llm.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";
import { answerMustAsk, MUST_ASK_TEST_OWNER } from "./fixtures/must-ask.ts";
import { gitIn, makeProject } from "./fixtures/talk-worktree.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
/** Subprocess tests can be slow on a loaded box. */
const T = 60_000;

/** The refusal reasons a local CLI run can get (REQ-cli-681). */
const IN_PLACE =
  "a local CLI run gets them only in the new worktree it made for itself, not with --here or outside a git repo";
const NOT_TOP = "the run is not at the top of the worktree this CLI run made for itself";
const SPAWNED =
  "a run with no role session gets them only as a local CLI run, and this one carries a Discord session or surface stamp";
const TOOL_CHILD = "a run started from inside a tool (the shell, a runner or a Fledge run) never gets them";

/** Env keys that make a run a product child; a local CLI run has none of them. */
const CHILD_KEYS = [
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  ACTING_SURFACE_ENV,
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_DISCORD_SESSION_ID",
  DELEGATE_DEPTH_ENV,
  // Set by every tool child (the shell, runners, Fledge runs): a task run started there is the model's.
  TOOL_CHILD_ENV,
  "WORKTREE_BASE_DIR",
];

/** process.env keys these tests set (runPlugin and the must-ask gate read it); restored after each test. */
const KEYS = [...CHILD_KEYS, "HOME", "CORVIDINHO_ALLOWLIST", "CORVIDINHO_OWNER_DISCORD_ID", "DISCORD_MUTED_USER_IDS"];

const temps: string[] = [];
/** Repos whose linked worktrees and talk/cli_* branches are removed after each test. */
const repos: string[] = [];
let saved: Record<string, string | undefined> = {};
let savedPath: string | undefined;
let restoreHooks: (() => void) | null = null;

function tempDir(prefix: string): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temps.push(d);
  return d;
}

function linked(repo: string): string[] {
  return gitIn(repo, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length))
    .filter((p) => p !== realpathSync(repo));
}

function cliBranches(repo: string): string[] {
  return gitIn(repo, "branch", "--list", "talk/*", "--format=%(refname:short)")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

beforeEach(() => {
  savedPath = process.env.PATH;
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  clearRegistry();
  loadBuiltins();
});

afterEach(() => {
  restoreHooks?.();
  restoreHooks = null;
  setMustAskNotifier(null);
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  clearRegistry();
  loadBuiltins();
  while (repos.length > 0) {
    const repo = repos.pop()!;
    if (!existsSync(repo)) continue;
    try {
      for (const w of linked(repo)) gitIn(repo, "worktree", "remove", "--force", w);
      for (const b of cliBranches(repo)) gitIn(repo, "branch", "-D", b);
    } catch {
      // Broken fixture repo: nothing linked.
    }
  }
});

afterAll(() => {
  for (const t of temps) {
    try {
      Bun.spawnSync(["rm", "-rf", t]);
    } catch {
      // The test run's temp root is removed anyway.
    }
  }
});

type Local = {
  base: string;
  project: string;
  /** The worktree a local task run made for itself (REQ-cli-122). */
  ws: Extract<CliTaskWorkspace, { kind: "worktree" }>;
  plain: string;
};

/** A temp git project and the worktree `enterCliTaskWorkspace` makes for a local run there. */
async function localRun(): Promise<Local> {
  const base = tempDir("corvidinho-safe3a-cli-");
  const project = makeProject(base);
  repos.push(project);
  const entered = await enterCliTaskWorkspace({ cwd: project, here: false, env: {} });
  if (!entered.ok || entered.workspace.kind !== "worktree") throw new Error("no CLI worktree");
  const plain = join(base, "plain");
  mkdirSync(plain);
  return { base, project, ws: entered.workspace, plain };
}

/** A local CLI run's env: nothing that makes it a product child. */
function localEnv(base: string, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    HOME: base,
    PATH: process.env.PATH,
    CORVIDINHO_ALLOWLIST_FILE: join(base, "no-allowlist.toml"),
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

describe("SAFE-3.a gate, local CLI rows (REQ-cli-681)", () => {
  test("granted: a local run at the top of the worktree it made for itself (through a symlink too)", async () => {
    const l = await localRun();
    expect(await shellToolsGate({ env: localEnv(l.base), cwd: l.ws.dir, talkWorktree: l.ws.dir })).toEqual({
      granted: true,
    });
    const link = join(l.base, "link-to-run");
    symlinkSync(l.ws.dir, link);
    expect(await shellToolsGate({ env: localEnv(l.base), cwd: link, talkWorktree: l.ws.dir })).toEqual({
      granted: true,
    });
    expect(isCliRunWorktree(l.ws.dir, l.ws.dir)).toBe(true);
    expect(isCliRunWorktree(link, l.ws.dir)).toBe(true);
  });

  test("refused in place: --here (the checkout) and a non-git folder pass no worktree", async () => {
    const l = await localRun();
    for (const cwd of [l.project, l.plain, l.ws.dir]) {
      expect({ cwd, v: await shellToolsGate({ env: localEnv(l.base), cwd }) }).toEqual({
        cwd,
        v: { granted: false, reason: IN_PLACE },
      });
      expect(await shellToolsGate({ env: localEnv(l.base), cwd, talkWorktree: "  " })).toEqual({
        granted: false,
        reason: IN_PLACE,
      });
    }
  });

  test("refused: any cwd but the top of that worktree, and a 'worktree' that is not a linked one", async () => {
    const l = await localRun();
    const sub = join(l.ws.dir, "sub");
    mkdirSync(sub);
    const other = await ensureTalkWorkspace({ projectWorkingDir: l.project, sessionId: "sess_safe3a_cli_other" });
    if (!other.ok) throw new Error("no other worktree");
    // A directory that borrows the run worktree's `.git` file: its admin dir points back elsewhere.
    const borrowed = join(l.base, "borrowed");
    mkdirSync(borrowed);
    writeFileSync(join(borrowed, ".git"), readFileSync(join(l.ws.dir, ".git"), "utf8"));
    const rows: [string, string][] = [
      [l.project, l.ws.dir],
      [sub, l.ws.dir],
      [other.workspace.workDir, l.ws.dir],
      [l.plain, l.ws.dir],
      [join(l.base, "missing"), l.ws.dir],
      // The main checkout, a non-git folder or a look-alike named as the run's worktree.
      [l.project, l.project],
      [l.plain, l.plain],
      [borrowed, borrowed],
      [l.ws.dir, join(l.base, "missing")],
    ];
    for (const [cwd, talkWorktree] of rows) {
      expect({ cwd, talkWorktree, v: await shellToolsGate({ env: localEnv(l.base), cwd, talkWorktree }) }).toEqual({
        cwd,
        talkWorktree,
        v: { granted: false, reason: NOT_TOP },
      });
      expect(isCliRunWorktree(cwd, talkWorktree)).toBe(false);
    }
  });

  test("refused even in its own worktree: delegate workers, WATCH, schedules and a spawned child without a role session", async () => {
    const l = await localRun();
    const verdict = (extra: Record<string, string>) =>
      shellToolsGate({ env: localEnv(l.base, extra), cwd: l.ws.dir, talkWorktree: l.ws.dir });
    for (const depth of ["1", "2", "junk"]) {
      expect(await verdict({ [DELEGATE_DEPTH_ENV]: depth })).toEqual({
        granted: false,
        reason: "a delegate or council worker never gets them",
      });
    }
    expect(await verdict({ CORVIDINHO_WATCH_SESSION_ID: "watch_1" })).toEqual({
      granted: false,
      reason: "WATCH runs never get them",
    });
    expect(await verdict({ CORVIDINHO_DISCORD_SESSION_ID: "schedule_s1" })).toEqual({
      granted: false,
      reason: "scheduled runs never get them",
    });
    const spawns: Record<string, string>[] = [
      { CORVIDINHO_DISCORD_SESSION_ID: "sess_1" },
      { [ACTING_SURFACE_ENV]: "chat" },
      { [ACTING_SURFACE_ENV]: "watch" },
      { [ACTING_SURFACE_ENV]: "schedule" },
      { [ACTING_SURFACE_ENV]: "cli" },
    ];
    for (const extra of spawns) {
      expect({ extra, v: await verdict(extra) }).toEqual({ extra, v: { granted: false, reason: SPAWNED } });
    }
    for (const root of [l.ws.dir, ""]) {
      expect(await verdict({ [TOOL_CHILD_ENV]: root })).toEqual({ granted: false, reason: TOOL_CHILD });
    }
  });

  test("refused: a task run the model starts from its granted shell, a runner or a Fledge run (a nested run's own worktree)", async () => {
    const l = await localRun();
    // The env a tool child gets from this run (shell-exec and the runners, the Fledge core runs).
    for (const childEnv of [runnerChildEnv(localEnv(l.base), l.ws.dir), fledgeCoreChildEnv(localEnv(l.base), l.ws.dir)]) {
      const nested = await enterCliTaskWorkspace({ cwd: l.ws.dir, here: false, env: childEnv });
      if (!nested.ok || nested.workspace.kind !== "worktree") throw new Error("no nested worktree");
      expect(await shellToolsGate({ env: childEnv, cwd: nested.workspace.dir, talkWorktree: nested.workspace.dir })).toEqual({
        granted: false,
        reason: TOOL_CHILD,
      });
      // Its worktree sits outside the parent run's worktree (the parent's repo cleanup removes it).
      expect(nested.workspace.dir.startsWith(`${l.ws.dir}/`)).toBe(false);
    }
  });

  test("a role session never uses the CLI worktree: the owner's chat there is not in its own talk worktree", async () => {
    const l = await localRun();
    const allowlist = join(l.base, "allowlist.toml");
    writeFileSync(allowlist, `[discord]\nchannels = []\n\n[owner]\ndiscord_id = "${MUST_ASK_TEST_OWNER}"\n`);
    const ownerChat = localEnv(l.base, {
      CORVIDINHO_ALLOWLIST_FILE: allowlist,
      CORVIDINHO_OWNER_DISCORD_ID: MUST_ASK_TEST_OWNER,
      CORVIDINHO_ACTING_IS_ADMIN: "1",
      CORVIDINHO_ACTING_DISCORD_USER_ID: MUST_ASK_TEST_OWNER,
      CORVIDINHO_ACTING_ROLE: "owner",
      CORVIDINHO_DISCORD_SESSION_ID: "sess_safe3a_cli_chat",
      [ACTING_SURFACE_ENV]: "chat",
    });
    expect(await shellToolsGate({ env: ownerChat, cwd: l.ws.dir, talkWorktree: l.ws.dir })).toEqual({
      granted: false,
      reason: "the run is not in this talk's own worktree",
    });
  });
});

// ------------------------------------------------------------ tool loop

type Call = { name: string; argv: string[] };

/** Fake provider: the first reply of each attempt makes `calls`, the next is plain text. */
function fakeProvider(calls: Call[]) {
  const offered: string[][] = [];
  const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      tools?: { function: { name: string } }[];
      messages?: { role: string }[];
    };
    const first = !(body.messages ?? []).some((m) => m.role === "tool");
    if (first) offered.push((body.tools ?? []).map((t) => t.function.name));
    const message =
      first && calls.length > 0
        ? {
            role: "assistant",
            content: null,
            tool_calls: calls.map((c, i) => ({
              id: `c${i}`,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify({ argv: c.argv }) },
            })),
          }
        : { role: "assistant", content: "ran it" };
    return Response.json({ choices: [{ message }] });
  };
  return { fetchImpl, offered };
}

/** A local `task run`'s execute, as `taskRunIn` builds it (`talkWorktree` only for its own worktree). */
function execute(cwd: string, calls: Call[], talkWorktree?: string, allowlist = ["shell-exec", "fledge-run"]) {
  const { fetchImpl, offered } = fakeProvider(calls);
  const events: AgentEvent[] = [];
  const exec = createTaskExecute({
    taskText: "run it",
    cwd,
    env: { ...process.env, ...FAKE_LLM_ENV },
    fetchImpl,
    tier: "code",
    nonInteractive: true,
    allowlist,
    autonomous: false,
    projectInstructions: false,
    onEvent: (e) => events.push(e),
    maxToolRounds: 2,
    ...(talkWorktree ? { talkWorktree } : {}),
  });
  return { attempt: (n: number) => exec({ attempt: n, signal: new AbortController().signal }), offered, events };
}

const results = (events: AgentEvent[]) =>
  events.filter((e): e is Extract<AgentEvent, { type: "ToolResult" }> => e.type === "ToolResult");
const texts = (events: AgentEvent[]) =>
  events.filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text").map((e) => e.text);

const RUN_IT: Call = { name: "shell-exec", argv: ["touch ran.marker && echo safe3a-cli-ok"] };

/** A stand-in `kubectl` first on PATH that records each call where it ran; never the host's. */
function fakeKubectl(base: string): (dir: string) => string[] {
  const bin = join(base, "kubectl-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "kubectl"), `#!/bin/sh\nprintf '%s\\n' "$*" >> kubectl.calls\n`);
  chmodSync(join(bin, "kubectl"), 0o755);
  process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
  return (dir) => {
    const log = join(dir, "kubectl.calls");
    return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
  };
}

describe("SAFE-3.a: a local task run in its own worktree gets the allowlisted shell (REQ-cli-681)", () => {
  test("offered at code tier and it runs in the run's worktree, not the checkout; no SAFE-3.a line", async () => {
    const l = await localRun();
    process.env.HOME = l.base;
    const run = execute(l.ws.dir, [RUN_IT], l.ws.dir);
    const result = await run.attempt(1);
    expect(run.offered[0]).toContain("shell-exec");
    expect(run.offered[0]).toContain("fledge-run");
    const r = results(run.events).find((e) => e.name === "shell-exec");
    expect(r?.success).toBe(true);
    expect(r?.detail ?? "").toContain("safe3a-cli-ok");
    expect(existsSync(join(l.ws.dir, "ran.marker"))).toBe(true);
    expect(existsSync(join(l.project, "ran.marker"))).toBe(false);
    expect(texts(run.events).some((t) => t.includes("SAFE-3.a"))).toBe(false);
    expect(result.unreportedEditTools).toEqual(["shell-exec"]);
    // The gate is re-read every attempt: still granted on attempt 2.
    await run.attempt(2);
    expect(run.offered[1]).toContain("shell-exec");
  });

  test("--here, a non-git folder and a subdirectory: not offered, the call is refused, one operator line per run", async () => {
    const l = await localRun();
    process.env.HOME = l.base;
    const sub = join(l.ws.dir, "sub");
    mkdirSync(sub);
    const rows: [string, string | undefined, string][] = [
      [l.project, undefined, IN_PLACE],
      [l.plain, undefined, IN_PLACE],
      [sub, l.ws.dir, NOT_TOP],
    ];
    for (const [cwd, talkWorktree, reason] of rows) {
      const run = execute(cwd, [RUN_IT], talkWorktree);
      const first = await run.attempt(1);
      const second = await run.attempt(2);
      for (const offered of run.offered) {
        expect(offered).not.toContain("shell-exec");
        expect(offered).not.toContain("fledge-run");
      }
      const calls = results(run.events).filter((e) => (e.detail ?? "").includes("shell-exec"));
      expect(calls.length).toBe(2);
      for (const c of calls) {
        expect(c.success).toBe(false);
        expect(c.detail ?? "").toContain("not offered");
      }
      expect(existsSync(join(cwd, "ran.marker"))).toBe(false);
      expect(texts(run.events).filter((t) => t.includes("SAFE-3.a"))).toEqual([
        `[operator] SAFE-3.a: shell-exec, fledge-run allowlisted but not offered: ${reason}`,
      ]);
      for (const r of [first, second]) expect(r.summary).not.toContain("SAFE-3.a");
    }
  });

  test("a prod command still raises the must-ask card; with no bridge nobody answers, it lapses (no) and the run says why", async () => {
    const l = await localRun();
    process.env.HOME = l.base;
    const calls = fakeKubectl(l.base);
    const h = answerMustAsk("none", { ttlMs: 300 });
    restoreHooks = h.restore;
    const notes: string[] = [];
    setMustAskNotifier((line) => notes.push(line));
    const run = execute(l.ws.dir, [{ name: "shell-exec", argv: ["kubectl get pods; touch ran.marker"] }], l.ws.dir);
    await run.attempt(1);
    expect(run.offered[0]).toContain("shell-exec");
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]!.kind).toBe(MUST_ASK_PROD_KIND);
    expect(h.requests[0]!.class).toBe("destructive");
    expect(JSON.stringify(h.requests[0])).toContain("kubectl get pods; touch ran.marker");
    const r = results(run.events).find((e) => e.name === "shell-exec");
    expect(r?.success).toBe(false);
    expect(r?.detail ?? "").toContain("no answer on the owner's Approve card");
    expect(r?.detail ?? "").toContain("with no bridge running it lapses");
    expect(calls(l.ws.dir)).toEqual([]);
    expect(existsSync(join(l.ws.dir, "ran.marker"))).toBe(false);
    // The wait line (stderr in text mode, a Text frame in ndjson) says no answer means no.
    expect(notes.some((n) => n.includes("waiting for the owner's OK on an Approve card with the one-time code"))).toBe(true);
    expect(notes.some((n) => n.includes("means no"))).toBe(true);
  });
});

// ------------------------------------------------------------ the real CLI

type Run = { code: number; out: string; err: string };

async function cli(cwd: string, args: string[], env: Record<string, string>): Promise<Run> {
  const proc = Bun.spawn(["bun", CLI, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, out, err };
}

/** The spawned CLI's env: the test's, minus every product-child key and repo-locating git var. */
function spawnEnv(base: string, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || k.startsWith("GIT_") || CHILD_KEYS.includes(k)) continue;
    env[k] = v;
  }
  // A fake `fledge` whose verify lane passes with a test summary (the shell's edit is a real diff).
  const bin = join(base, "fledge-bin");
  mkdirSync(bin, { recursive: true });
  const out = join(base, "lane-output.txt");
  writeFileSync(out, LANE_PASS_OUTPUT);
  writeFileSync(join(bin, "fledge"), `#!/bin/sh\ncat '${out}'\nexit 0\n`);
  chmodSync(join(bin, "fledge"), 0o755);
  return {
    ...env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    CORVIDINHO_ALLOWLIST: "shell-exec",
    CORVIDINHO_LLM_TIER: "code",
    ...extra,
  };
}

/** First model turn runs the shell (when offered), later turns answer. */
function runsShell(): (body: unknown) => FakeReply {
  let n = 0;
  return () =>
    n++ === 0
      ? { toolCalls: [{ name: "shell-exec", args: JSON.stringify({ argv: ["touch ran.marker && echo safe3a-cli-ok"] }) }] }
      : "Ran it.";
}

const fakes: ReturnType<typeof startFakeLlm>[] = [];
afterAll(() => {
  for (const f of fakes) f.stop();
});

function offeredTools(body: unknown): string[] {
  return ((body as { tools?: { function: { name: string } }[] } | null)?.tools ?? []).map((t) => t.function.name);
}

describe("task run CLI: the shell only in its own worktree (REQ-cli-681)", () => {
  test("by default the allowlisted shell is offered and runs in the run's own worktree", async () => {
    const base = tempDir("corvidinho-safe3a-cli-run-");
    const repo = makeProject(base);
    repos.push(repo);
    const fake = startFakeLlm({ reply: runsShell() });
    fakes.push(fake);
    const r = await cli(repo, ["task", "run", "--task", "run the shell", "--json"], spawnEnv(base, fake.env));
    const { result, events } = JSON.parse(r.out) as { result: TaskResult; events: AgentEvent[] };
    expect(offeredTools(fake.requests[0])).toContain("shell-exec");
    const ran = results(events).find((e) => e.name === "shell-exec");
    expect(ran?.success).toBe(true);
    expect(ran?.detail ?? "").toContain("safe3a-cli-ok");
    expect(texts(events).some((t) => t.includes("SAFE-3.a"))).toBe(false);
    const ws = result.workspace;
    expect(ws?.kept).toBe(true);
    expect(existsSync(join(ws!.dir, "ran.marker"))).toBe(true);
    expect(existsSync(join(repo, "ran.marker"))).toBe(false);
    expect(linked(repo)).toEqual([ws!.dir]);
    expect(r.code).toBe(0);
  }, T);

  test("--here (text output): not offered, one SAFE-3.a line on stderr, nothing runs, no worktree", async () => {
    const base = tempDir("corvidinho-safe3a-cli-here-");
    const repo = makeProject(base);
    repos.push(repo);
    const fake = startFakeLlm({ reply: runsShell() });
    fakes.push(fake);
    const r = await cli(repo, ["task", "run", "--here", "--task", "run the shell"], spawnEnv(base, fake.env));
    expect(offeredTools(fake.requests[0])).not.toContain("shell-exec");
    const line = `[operator] SAFE-3.a: shell-exec allowlisted but not offered: ${IN_PLACE}`;
    expect(r.err.split("\n").filter((l) => l.includes("SAFE-3.a"))).toEqual([line]);
    expect(r.out).not.toContain("SAFE-3.a");
    expect(existsSync(join(repo, "ran.marker"))).toBe(false);
    expect(linked(repo)).toEqual([]);
    expect(cliBranches(repo)).toEqual([]);
  }, T);

  test("a non-git folder (--json): not offered, one SAFE-3.a Text event, nothing runs", async () => {
    const base = tempDir("corvidinho-safe3a-cli-plain-");
    const plain = join(base, "plain");
    mkdirSync(plain);
    const fake = startFakeLlm({ reply: runsShell() });
    fakes.push(fake);
    const r = await cli(plain, ["task", "run", "--task", "run the shell", "--json"], spawnEnv(base, fake.env));
    const { result, events } = JSON.parse(r.out) as { result: TaskResult; events: AgentEvent[] };
    expect(offeredTools(fake.requests[0])).not.toContain("shell-exec");
    expect(texts(events).filter((t) => t.includes("SAFE-3.a"))).toEqual([
      `[operator] SAFE-3.a: shell-exec allowlisted but not offered: ${IN_PLACE}`,
    ]);
    expect(result.summary).not.toContain("SAFE-3.a");
    expect(result.workspace).toBeUndefined();
    expect(existsSync(join(plain, "ran.marker"))).toBe(false);
  }, T);
});
