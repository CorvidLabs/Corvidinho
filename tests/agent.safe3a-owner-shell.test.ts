/**
 * SAFE-3.a (#83, #124, REQ-agent-501 / REQ-agent-503) end to end through
 * `createTaskExecute`: the owner's chat in its own talk worktree is offered
 * the allowlisted `shell-exec` at code tier and it runs there, still through
 * `runPlugin`'s must-ask gate (AUTONOMY-9: a prod command waits for the
 * owner's Approve card, a deny runs nothing); anywhere else the tool stays
 * out of the catalog, the model's call is refused as not offered, and one
 * operator Text line (never reply text) says why. The gate is re-read for
 * every attempt.
 *
 * Fake provider (injected fetch), temp git project and talk worktree made by
 * `ensureTalkWorkspace`, temp allowlist file, the real card store, a stand-in
 * `kubectl` first on PATH for the prod command; no network, no tokens.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { MUST_ASK_PROD_KIND, setMustAskNotifier } from "../src/plugins/must-ask.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { ensureTalkWorkspace } from "../src/worktree/manager.ts";
import { FAKE_LLM_ENV } from "./fixtures/fake-llm.ts";
import { answerMustAsk, MUST_ASK_TEST_OWNER } from "./fixtures/must-ask.ts";
import { makeProject } from "./fixtures/talk-worktree.ts";

const OWNER = MUST_ASK_TEST_OWNER;
const TEAM = "200000000000000002";
const SID = "sess_safe3a_e2e";
const SURFACE = "CORVIDINHO_ACTING_SURFACE";

/** Keys the owner's run env sets in process.env (runPlugin reads it); restored after each test. */
const KEYS = [
  "HOME",
  "WORKTREE_BASE_DIR",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_WATCH_SESSION_ID",
  "CORVIDINHO_DELEGATE_DEPTH",
  "DISCORD_MUTED_USER_IDS",
  SURFACE,
] as const;

let saved: Record<string, string | undefined> = {};
let savedPath: string | undefined;
let restoreHooks: (() => void) | null = null;
const temps: string[] = [];

function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
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
});

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

type Talk = { base: string; project: string; work: string };

/**
 * A stand-in `kubectl` first on PATH (shell-exec's child env is process.env,
 * restored after each test): it records each call in the directory it ran in
 * and returns at once. The prod command never runs the host's real kubectl,
 * whose run time the test can't bound (ubuntu-latest CI runners ship one: it
 * took 2.4-3.1 s there and once passed bun's 5 s test timeout) and which,
 * with an operator's KUBECONFIG, would contact a real cluster.
 */
function fakeKubectl(): { calls: (dir: string) => string[] } {
  const bin = tempDir("corvidinho-safe3a-bin-");
  const tool = join(bin, "kubectl");
  writeFileSync(tool, `#!/bin/sh\nprintf '%s\\n' "$*" >> kubectl.calls\n`);
  chmodSync(tool, 0o755);
  process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
  return {
    calls: (dir) => {
      const log = join(dir, "kubectl.calls");
      return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
    },
  };
}

async function ownerTalk(): Promise<Talk> {
  const base = tempDir("corvidinho-safe3a-e2e-");
  const project = makeProject(base);
  const made = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId: SID });
  if (!made.ok || made.workspace.kind !== "worktree") throw new Error("no talk worktree");
  const allowlist = join(base, "allowlist.toml");
  writeFileSync(
    allowlist,
    `[discord]\nchannels = ["600000000000000006"]\ndeny_users = []\n\n[owner]\ndiscord_id = "${OWNER}"\ndisplay = "Leif"\n\n[people.tofu]\ndisplay = "Tofu"\nrole = "team"\ndiscord_ids = ["${TEAM}"]\n`,
  );
  // The owner's chat as the Discord spawn client stamps it (process.env,
  // which runPlugin and the must-ask gate read), nothing left from before.
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, {
    HOME: base,
    CORVIDINHO_ALLOWLIST_FILE: allowlist,
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: "1",
    CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER,
    CORVIDINHO_ACTING_ROLE: "owner",
    CORVIDINHO_ACTING_WORK_TASK: "0",
    CORVIDINHO_DISCORD_SESSION_ID: SID,
    [SURFACE]: "chat",
  });
  return { base, project, work: made.workspace.workDir };
}

type Call = { name: string; argv: string[] };

/**
 * Fake provider: each attempt's first reply makes `calls`, its next reply is
 * plain text. `offered[i]` holds the tool names of attempt i+1's first request.
 */
function fakeProvider(calls: Call[]) {
  const seen = { offered: [] as string[][] };
  const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      tools?: { function: { name: string } }[];
      messages?: { role: string }[];
    };
    const first = !(body.messages ?? []).some((m) => m.role === "tool");
    if (first) seen.offered.push((body.tools ?? []).map((t) => t.function.name));
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
  return { fetchImpl, seen };
}

function execute(cwd: string, calls: Call[], allowlist = ["shell-exec"]) {
  const { fetchImpl, seen } = fakeProvider(calls);
  const events: AgentEvent[] = [];
  const env: NodeJS.ProcessEnv = { ...process.env, ...FAKE_LLM_ENV };
  const exec = createTaskExecute({
    taskText: "run it",
    cwd,
    env,
    fetchImpl,
    tier: "code",
    nonInteractive: true,
    allowlist,
    autonomous: false,
    projectInstructions: false,
    onEvent: (e) => events.push(e),
    maxToolRounds: 2,
  });
  const attempt = (n: number) => exec({ attempt: n, signal: new AbortController().signal });
  return { attempt, env, seen, events };
}

const results = (events: AgentEvent[]) =>
  events.filter((e): e is Extract<AgentEvent, { type: "ToolResult" }> => e.type === "ToolResult");
const texts = (events: AgentEvent[]) =>
  events.filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text").map((e) => e.text);

const RUN_IT: Call = { name: "shell-exec", argv: ["touch ran.marker && echo safe3a-ok"] };

describe("SAFE-3.a: the owner's own chat gets the allowlisted shell in its own worktree", () => {
  test("offered at code tier and it runs in the talk worktree; no SAFE-3.a line", async () => {
    const talk = await ownerTalk();
    const run = execute(talk.work, [RUN_IT]);
    const result = await run.attempt(1);
    expect(run.seen.offered[0]).toContain("shell-exec");
    const r = results(run.events).find((e) => e.name === "shell-exec");
    expect(r?.success).toBe(true);
    expect(r?.detail ?? "").toContain("safe3a-ok");
    expect(existsSync(join(talk.work, "ran.marker"))).toBe(true);
    expect(existsSync(join(talk.project, "ran.marker"))).toBe(false);
    expect(texts(run.events).some((t) => t.includes("SAFE-3.a"))).toBe(false);
    expect(result.summary).toBe("ran it");
    // The shell's edits are ones no result reports (AGENT-4, REQ-agent-502).
    expect(result.unreportedEditTools).toEqual(["shell-exec"]);
  });

  test("/session start, /work and an ask answer continuing the talk get it too", async () => {
    const talk = await ownerTalk();
    for (const surface of ["session", "work", "ask"]) {
      process.env[SURFACE] = surface;
      const run = execute(talk.work, []);
      await run.attempt(1);
      expect({ surface, offered: run.seen.offered[0]?.includes("shell-exec") }).toEqual({ surface, offered: true });
    }
  });

  test("the owner's shell-exec of a prod command still raises the must-ask Approve card; a deny runs nothing", async () => {
    const talk = await ownerTalk();
    const kubectl = fakeKubectl();
    const h = answerMustAsk("denied");
    restoreHooks = h.restore;
    const notes: string[] = [];
    setMustAskNotifier((line) => notes.push(line));
    const prod: Call = { name: "shell-exec", argv: ["kubectl get pods; touch ran.marker"] };
    const run = execute(talk.work, [prod]);
    await run.attempt(1);
    expect(run.seen.offered[0]).toContain("shell-exec");
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]!.kind).toBe(MUST_ASK_PROD_KIND);
    expect(h.requests[0]!.class).toBe("destructive");
    expect(JSON.stringify(h.requests[0])).toContain("kubectl get pods; touch ran.marker");
    const r = results(run.events).find((e) => e.name === "shell-exec");
    expect(r?.success).toBe(false);
    expect(existsSync(join(talk.work, "ran.marker"))).toBe(false);
    expect(kubectl.calls(talk.work)).toEqual([]);
    expect(notes.some((n) => n.includes("AUTONOMY-9: waiting for the owner's OK on an Approve card"))).toBe(true);
  });

  test("approved on the card, the same prod command runs once in the talk worktree", async () => {
    const talk = await ownerTalk();
    const kubectl = fakeKubectl();
    const h = answerMustAsk("approved");
    restoreHooks = h.restore;
    setMustAskNotifier(() => {});
    const run = execute(talk.work, [{ name: "shell-exec", argv: ["kubectl get pods; touch ran.marker"] }]);
    await run.attempt(1);
    expect(h.requests).toHaveLength(1);
    expect(kubectl.calls(talk.work)).toEqual(["get pods"]);
    expect(kubectl.calls(talk.project)).toEqual([]);
    expect(existsSync(join(talk.work, "ran.marker"))).toBe(true);
  });
});

describe("SAFE-3.a: everywhere else the shell stays out, with one operator line", () => {
  async function refused(
    cwd: (t: Talk) => string,
    env: Record<string, string>,
    reason: string,
    ownerCatalog = true,
  ) {
    const talk = await ownerTalk();
    Object.assign(process.env, env);
    const run = execute(cwd(talk), [RUN_IT], ["shell-exec", "fledge-run", "files-delete"]);
    const first = await run.attempt(1);
    const second = await run.attempt(2);
    for (const offered of run.seen.offered) {
      expect(offered).not.toContain("shell-exec");
      expect(offered).not.toContain("fledge-run");
    }
    // The owner's other allowlisted dangerous tools are unchanged (files-delete, code tier).
    if (ownerCatalog) expect(run.seen.offered[0]).toContain("files-delete");
    const calls = results(run.events).filter((e) => (e.detail ?? "").includes("shell-exec"));
    expect(calls.length).toBe(2);
    for (const c of calls) {
      expect(c.success).toBe(false);
    }
    expect(existsSync(join(cwd(talk), "ran.marker"))).toBe(false);
    const lines = texts(run.events).filter((t) => t.includes("SAFE-3.a"));
    expect(lines).toEqual([
      `[operator] SAFE-3.a: shell-exec, fledge-run allowlisted but not offered: ${reason}`,
    ]);
    // Never reply text.
    for (const r of [first, second]) expect(r.summary).not.toContain("SAFE-3.a");
    return calls;
  }

  test("the owner's run outside its own worktree (the main checkout): refused as not offered", async () => {
    const calls = await refused((t) => t.project, {}, "the run is not in this talk's own worktree");
    for (const c of calls) expect(c.detail ?? "").toContain("not offered");
  });

  test("a team member's chat in its own worktree: refused", async () => {
    const calls = await refused(
      (t) => t.work,
      { CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_DISCORD_USER_ID: TEAM, CORVIDINHO_ACTING_ROLE: "team" },
      "only the owner's own runs get them",
      false,
    );
    for (const c of calls) expect(c.detail ?? "").toContain("not allowed for your role");
  });

  test("WATCH, a schedule, a delegate worker and a local CLI run: refused", async () => {
    await refused((t) => t.work, { [SURFACE]: "watch" }, "only the owner's chat, /session start, /work and their ask answers get them (this run: watch)");
    await refused((t) => t.work, { [SURFACE]: "schedule", CORVIDINHO_DISCORD_SESSION_ID: `schedule_${SID}` }, "scheduled runs never get them");
    await refused((t) => t.work, { CORVIDINHO_DELEGATE_DEPTH: "1" }, "a delegate or council worker never gets them");
    const talk = await ownerTalk();
    delete process.env.CORVIDINHO_ACTING_IS_ADMIN;
    const run = execute(talk.work, [RUN_IT]);
    await run.attempt(1);
    expect(run.seen.offered[0]).not.toContain("shell-exec");
    expect(texts(run.events)).toContain(
      "[operator] SAFE-3.a: shell-exec allowlisted but not offered: a local CLI run has no role session (the CLI half of SAFE-3.a is not built yet)",
    );
  });

  test("the gate is re-read every attempt: muted after attempt 1, the owner's attempt 2 has no shell", async () => {
    const talk = await ownerTalk();
    const run = execute(talk.work, []);
    await run.attempt(1);
    expect(run.seen.offered[0]).toContain("shell-exec");
    run.env.DISCORD_MUTED_USER_IDS = OWNER;
    await run.attempt(2);
    expect(run.seen.offered[1]).not.toContain("shell-exec");
    expect(texts(run.events).filter((t) => t.includes("SAFE-3.a"))).toEqual([
      "[operator] SAFE-3.a: shell-exec allowlisted but not offered: only the owner's own runs get them",
    ]);
  });

  test("an allowlist that names none of the six: no gate, no line", async () => {
    const talk = await ownerTalk();
    process.env[SURFACE] = "watch";
    const run = execute(talk.work, [], ["files-delete"]);
    await run.attempt(1);
    expect(texts(run.events).some((t) => t.includes("SAFE-3.a"))).toBe(false);
  });
});
