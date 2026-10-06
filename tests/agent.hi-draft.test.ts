/**
 * Where a repo uses hi, it drafts criteria and asks before capturing them,
 * never inventing them (AGENT-18, the hi clause's drafting half):
 * REQ-agent-521 (the `hi-draft` tool: who gets it, what it checks, how the
 * run ends) and REQ-agent-522 (the hi guard lets through exactly what
 * approved captures made, and nothing else).
 *
 * Temp git repos and talk worktrees only (never this checkout), a stand-in
 * `hi` on PATH (tests/fixtures/stand-in-hi.ts), a scripted model, stub
 * verify runners. The capture requests and the ledger go to the test data
 * dir (tests/preload.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute } from "../src/agent/execute.ts";
import { HiCaptureStore, recordHiCaptureFiles } from "../src/agent/hi-capture-store.ts";
import {
  HI_DRAFT_TOOL,
  hiCaptureCommand,
  hiDraftGate,
  parseHiDraftArgs,
  parseHiExport,
  runHiCapture,
  validateHiDrafts,
} from "../src/agent/hi-drafts.ts";
import { runTask } from "../src/agent/loop.ts";
import { hiChangesSince } from "../src/agent/repo-ways.ts";
import { ACTING_SURFACE_ENV, TOOL_CHILD_ENV } from "../src/agent/shell-gate.ts";
import type { AgentEvent, VerifyRunner } from "../src/agent/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import type { RunOptions } from "../src/plugins/run.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { openWorkPr, type OpenWorkPrDeps } from "../src/work/pr.ts";
import { ensureTalkWorkspace } from "../src/worktree/manager.ts";
import { LANE_PASS_OUTPUT } from "./fixtures/lane-output.ts";
import { pathWithHi, writeStandInHi } from "./fixtures/stand-in-hi.ts";
import { gitIn } from "./fixtures/talk-worktree.ts";

const OWNER = "100000000000000001";
const TEAM = "200000000000000002";
const STRANGER = "300000000000000003";
const CHANNEL = "600000000000000006";

const bases: string[] = [];
function tempBase(): string {
  const b = mkdtempSync(join(tmpdir(), "corvidinho-hi-draft-"));
  bases.push(b);
  return b;
}

let HI_BIN = "";
beforeAll(() => {
  loadBuiltins();
  HI_BIN = writeStandInHi(tempBase());
});
afterAll(() => {
  for (const b of bases) rmSync(b, { recursive: true, force: true });
});

const HI_AGENT = [
  "---",
  "hi: 1",
  "families: [AGENT]",
  "owner: leif",
  "---",
  "",
  "# Agent",
  "",
  "## Intent",
  "",
  "It works each repo's own way.",
  "",
  "## Criteria",
  "",
  "- **AGENT-18**  It works each repo's own way.",
  "  - **AGENT-18.a**  On Corvidinho it may approve its own change.",
  "- **AGENT-19**  It keeps a second promise.",
  "",
  "## Retired",
  "",
  "- **AGENT-2**  old wording",
  "  retired: replaced by AGENT-18.",
  "",
].join("\n");

const LLM_ENV = {
  CORVIDINHO_LLM_API_KEY: "test-key-not-real",
  CORVIDINHO_LLM_BASE_URL: "https://llm.test/v1",
  CORVIDINHO_LLM_MODEL: "test-model",
  CORVIDINHO_LLM_TIER: "tool",
};

type Fixture = { base: string; project: string; work: string; branch: string; allowlist: string; sessionId: string };

/** A hi project (git, `main`, an origin) and a talk worktree of it, as the bridge makes one. */
async function fixture(sessionId = `sess_hi_draft_${bases.length}`): Promise<Fixture> {
  const base = tempBase();
  const project = join(base, "widget");
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(project, "hi"), { recursive: true });
  gitIn(project, "init", "-q", "-b", "main");
  gitIn(project, "config", "user.name", "Fixture Bot");
  gitIn(project, "config", "user.email", "fixture@example.invalid");
  gitIn(project, "config", "commit.gpgsign", "false");
  writeFileSync(join(project, "src", "app.ts"), "export const x = 1;\n");
  writeFileSync(join(project, "hi", "agent.md"), HI_AGENT);
  writeFileSync(join(project, "INTENT.md"), "# Intent\n");
  gitIn(project, "add", "-A");
  gitIn(project, "commit", "-q", "-m", "init");
  const bare = join(base, "acme", "widget.git");
  mkdirSync(bare, { recursive: true });
  gitIn(bare, "init", "-q", "--bare");
  gitIn(project, "remote", "add", "origin", bare);
  gitIn(project, "push", "-q", "origin", "main");
  gitIn(project, "fetch", "-q", "origin");
  gitIn(project, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  const made = await ensureTalkWorkspace({ projectWorkingDir: project, sessionId });
  if (!made.ok) throw new Error(made.error);
  const work = made.workspace.workDir;
  const branch = gitIn(work, "symbolic-ref", "--short", "HEAD").trim();
  const allowlist = join(base, "allowlist.toml");
  writeFileSync(
    allowlist,
    `[discord]
channels = ["${CHANNEL}"]

[owner]
discord_id = "${OWNER}"
display = "Leif"

[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TEAM}"]
`,
  );
  return { base, project, work, branch, allowlist, sessionId };
}

/** A Discord run's env as the spawn client stamps it (owner unless `user` says otherwise). */
function discordEnv(f: Fixture, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...LLM_ENV,
    HOME: f.base,
    PATH: pathWithHi(HI_BIN),
    CORVIDINHO_DATA_DIR: process.env.CORVIDINHO_DATA_DIR,
    CORVIDINHO_ALLOWLIST_FILE: f.allowlist,
    CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    CORVIDINHO_ACTING_IS_ADMIN: "1",
    CORVIDINHO_ACTING_DISCORD_USER_ID: OWNER,
    CORVIDINHO_ACTING_ROLE: "owner",
    CORVIDINHO_ACTING_WORK_TASK: "0",
    CORVIDINHO_DISCORD_SESSION_ID: f.sessionId,
    CORVIDINHO_DISCORD_REPLY_CHANNEL_ID: CHANNEL,
    [ACTING_SURFACE_ENV]: "chat",
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

function teamEnv(f: Fixture, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return discordEnv(f, {
    CORVIDINHO_ACTING_IS_ADMIN: "0",
    CORVIDINHO_ACTING_DISCORD_USER_ID: TEAM,
    CORVIDINHO_ACTING_ROLE: "team",
    ...extra,
  });
}

/** A local CLI run: no role session, no Discord stamps. */
function cliEnv(f: Fixture, extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...LLM_ENV,
    HOME: f.base,
    PATH: pathWithHi(HI_BIN),
    CORVIDINHO_DATA_DIR: process.env.CORVIDINHO_DATA_DIR,
    CORVIDINHO_ALLOWLIST_FILE: f.allowlist,
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

const HI_WAYS = { sdd: false, hi: true, trust: false };

type Msg = {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

function reply(message: Msg): Response {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function toolCall(name: string, args: unknown): Msg {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "c1", type: "function", function: { name, arguments: JSON.stringify(args) } }],
  };
}

/** A scripted model: each call takes the next reply; records the request bodies. */
function model(replies: Msg[]) {
  const bodies: { tools?: { function: { name: string } }[]; messages: { role: string; content: string }[] }[] = [];
  let i = 0;
  const fetchImpl = async (_u: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    return reply(replies[Math.min(i++, replies.length - 1)]!);
  };
  return { bodies, fetchImpl, calls: () => i };
}

function requestsFor(work: string) {
  const db = openCorvidinhoDb();
  try {
    return new HiCaptureStore({ db }).pending().filter((r) => r.worktree === realpathSync(work));
  } finally {
    db.close();
  }
}

/** Build a fake GitHub-looking token at runtime (never a real key). */
const FAKE_TOKEN = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);

const TWO = [
  { id: "AGENT-20", text: "It drafts criteria and asks before capturing them." },
  { id: "AGENT-18.b", text: "A drafted criterion names the requester's own words." },
];

// ------------------------------------------------------------------ arguments

describe("hi-draft arguments and checks (REQ-agent-521)", () => {
  const exp = parseHiExport(
    JSON.stringify({
      files: [
        {
          file: "hi/agent.md",
          families: ["AGENT"],
          criteria: [
            { id: "AGENT-18", text: "x" },
            { id: "AGENT-19", text: "y" },
          ],
          retired: [{ id: "AGENT-2", text: "old" }],
        },
      ],
    }),
  )!;

  test("arguments: one-line texts, whitespace collapsed; malformed or too many refused", () => {
    expect(parseHiDraftArgs(JSON.stringify({ drafts: [{ id: " AGENT-20 ", text: "  two\n lines\there " }] }))).toEqual({
      ok: true,
      drafts: [{ id: "AGENT-20", text: "two lines here" }],
    });
    for (const raw of ["", "nope", "{}", '{"drafts":[]}', '{"drafts":[{"id":"AGENT-20"}]}']) {
      expect(parseHiDraftArgs(raw).ok).toBe(false);
    }
    const six = Array.from({ length: 6 }, (_, n) => ({ id: `AGENT-${30 + n}`, text: "t" }));
    expect(parseHiDraftArgs(JSON.stringify({ drafts: six }))).toMatchObject({ ok: false });
    const bell = parseHiDraftArgs(JSON.stringify({ drafts: [{ id: "AGENT-20", text: "ring\u0007" }] }));
    expect(bell.ok ? "" : bell.error).toContain("control characters");
  });

  test("ids: new, in a declared family, not retired, a dotted id under a captured or earlier-drafted parent", () => {
    expect(validateHiDrafts([{ id: "AGENT-20", text: "ok" }], exp)).toBeNull();
    expect(validateHiDrafts([{ id: "AGENT-18.b", text: "ok" }], exp)).toBeNull();
    expect(validateHiDrafts([{ id: "AGENT-20", text: "p" }, { id: "AGENT-20.a", text: "c" }], exp)).toBeNull();
    expect(validateHiDrafts([{ id: "BOGUS-1", text: "t" }], exp)).toContain("no hi file declares the family BOGUS");
    expect(validateHiDrafts([{ id: "AGENT-19", text: "t" }], exp)).toContain("already captured");
    expect(validateHiDrafts([{ id: "AGENT-2", text: "t" }], exp)).toContain("retired");
    expect(validateHiDrafts([{ id: "AGENT-21.a", text: "t" }], exp)).toContain("needs its parent AGENT-21");
    expect(validateHiDrafts([{ id: "AGENT-20", text: "a" }, { id: "AGENT-20", text: "b" }], exp)).toContain("drafted twice");
    expect(validateHiDrafts([{ id: "agent-20", text: "t" }], exp)).toContain("is not a hi id");
    expect(validateHiDrafts([{ id: "AGENT-20", text: "x".repeat(401) }], exp)).toContain("over 400");
    expect(validateHiDrafts([{ id: "AGENT-20", text: "--root=/elsewhere" }], exp)).toContain('must not start with "-"');
  });

  test("a draft that SAFE-6 scrubbing would change is refused", () => {
    const why = validateHiDrafts([{ id: "AGENT-20", text: `It uses ${FAKE_TOKEN} for pushes.` }], exp);
    expect(why).toContain("a draft that scrubbing would change is refused (SAFE-6)");
  });

  test("the exact capture command quotes the text as one shell word", () => {
    expect(hiCaptureCommand({ id: "AGENT-20", text: "It's here" })).toBe(`hi AGENT-20 'It'\\''s here'`);
  });
});

// ------------------------------------------------------------------ who

describe("who is offered hi-draft (REQ-agent-521)", () => {
  test("the owner's and the team's own chat, ask, /session start and /work runs in a git worktree: the card", async () => {
    const f = await fixture();
    for (const surface of ["chat", "ask", "session", "work"]) {
      expect(await hiDraftGate({ env: discordEnv(f, { [ACTING_SURFACE_ENV]: surface }), cwd: f.work, ways: HI_WAYS })).toEqual({
        offered: true,
        mode: "card",
        role: "owner",
      });
    }
    expect(await hiDraftGate({ env: teamEnv(f), cwd: f.work, ways: HI_WAYS })).toEqual({ offered: true, mode: "card", role: "team" });
    expect(await hiDraftGate({ env: cliEnv(f), cwd: f.work, ways: HI_WAYS })).toEqual({ offered: true, mode: "cli", role: null });
  });

  test("never: community, WATCH, schedules, workers, another surface, a repo without hi, not this talk's own worktree", async () => {
    const f = await fixture();
    const why = async (env: NodeJS.ProcessEnv, cwd = f.work, ways = HI_WAYS) => {
      const g = await hiDraftGate({ env, cwd, ways });
      expect(g.offered).toBe(false);
      return g.offered ? "" : g.reason;
    };
    const community = { CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_DISCORD_USER_ID: STRANGER, CORVIDINHO_ACTING_ROLE: "community" };
    expect(await why(discordEnv(f, community))).toContain("only the owner's and the team's runs");
    // A declared team member stamped community by the surface stays community.
    expect(await why(teamEnv(f, { CORVIDINHO_ACTING_ROLE: "community" }))).toContain("only the owner's and the team's runs");
    expect(await why(discordEnv(f, { CORVIDINHO_WATCH_SESSION_ID: "w1" }))).toContain("WATCH");
    expect(await why(discordEnv(f, { [ACTING_SURFACE_ENV]: "watch" }))).toContain("WATCH");
    expect(await why(discordEnv(f, { CORVIDINHO_DISCORD_SESSION_ID: "schedule_s1" }))).toContain("scheduled runs");
    expect(await why(discordEnv(f, { CORVIDINHO_DELEGATE_DEPTH: "1" }))).toContain("delegate or council worker");
    expect(await why(cliEnv(f, { CORVIDINHO_DELEGATE_DEPTH: "1" }))).toContain("delegate or council worker");
    expect(await why(discordEnv(f, { [ACTING_SURFACE_ENV]: undefined }))).toContain("only chat, ask answers");
    expect(await why(discordEnv(f), f.work, { sdd: true, hi: false, trust: false })).toContain("does not keep criteria in hi/");
    const plain = join(f.base, "plain");
    mkdirSync(plain);
    expect(await why(discordEnv(f), plain)).toContain("this run is not in it");
    // The main checkout, or another talk's worktree, is never where a capture goes.
    expect(await why(discordEnv(f), f.project)).toContain("this run is not in it");
    expect(await why(discordEnv(f, { CORVIDINHO_DISCORD_SESSION_ID: "sess_someone_else" }))).toContain("this run is not in it");
    expect(await why(cliEnv(f, { CORVIDINHO_DISCORD_SESSION_ID: "sess_x" }))).toContain("only as a local CLI run");
    expect(await why(cliEnv(f, { [TOOL_CHILD_ENV]: f.work }))).toContain("inside a tool");
  });
});

// ------------------------------------------------------------------ the run

describe("a run drafts, asks and captures nothing (REQ-agent-521)", () => {
  test("the owner's chat: hi-draft is offered, records a capture request and ends the run with the ask", async () => {
    const f = await fixture();
    const m = model([toolCall(HI_DRAFT_TOOL, { drafts: TWO })]);
    const exec = createTaskExecute({ taskText: "add a criterion", env: discordEnv(f), cwd: f.work, fetchImpl: m.fetchImpl, tier: "tool" });
    const r = await exec({ attempt: 1, signal: new AbortController().signal, repoWays: HI_WAYS });
    expect(m.calls()).toBe(1);
    expect((m.bodies[0]!.tools ?? []).map((t) => t.function.name)).toContain(HI_DRAFT_TOOL);
    expect(m.bodies[0]!.messages[0]!.content).toContain("draft it with hi-draft");
    expect(r.ask?.reason).toBe("clarify");
    const q = r.ask!.question;
    expect(q).toContain("captured nothing (AGENT-18)");
    expect(q).toContain("• AGENT-20 — It drafts criteria and asks before capturing them.");
    expect(q).toContain("• AGENT-18.b — ");
    expect(q).toContain("only their Approve captures them");
    const [req] = requestsFor(f.work);
    expect(req).toBeDefined();
    expect(q).toContain(`request ${req!.id}`);
    expect(req!).toMatchObject({
      status: "pending",
      branch: f.branch,
      worktree: realpathSync(f.work),
      repo: realpathSync(join(f.project, ".git")),
      drafts: TWO,
      requester: OWNER,
      role: "owner",
      surface: "chat",
      sessionId: f.sessionId,
      originChannelId: CHANNEL,
    });
    // Nothing captured.
    expect(readFileSync(join(f.work, "hi", "agent.md"), "utf8")).toBe(HI_AGENT);
  });

  test("an id already waiting on the owner's card is not drafted again", async () => {
    const f = await fixture();
    const first = model([toolCall(HI_DRAFT_TOOL, { drafts: [TWO[0]] })]);
    const exec1 = createTaskExecute({ taskText: "add a criterion", env: discordEnv(f), cwd: f.work, fetchImpl: first.fetchImpl, tier: "tool" });
    expect((await exec1({ attempt: 1, signal: new AbortController().signal, repoWays: HI_WAYS })).ask?.reason).toBe("clarify");
    const [open] = requestsFor(f.work);
    const again = model([toolCall(HI_DRAFT_TOOL, { drafts: TWO }), { role: "assistant", content: "It already waits on the card." }]);
    const exec2 = createTaskExecute({ taskText: "add it again", env: discordEnv(f), cwd: f.work, fetchImpl: again.fetchImpl, tier: "tool" });
    const r = await exec2({ attempt: 1, signal: new AbortController().signal, repoWays: HI_WAYS });
    expect(r.ask).toBeUndefined();
    const toolMsg = again.bodies[1]!.messages.find((x) => x.role === "tool")!;
    expect(toolMsg.content).toContain(`AGENT-20 already waits on the owner's card (request ${open!.id}); nothing new was drafted`);
    expect(requestsFor(f.work).map((x) => x.id)).toEqual([open!.id]);
  });

  test("through runTask the run ends blocked, never done, and the lane does not run", async () => {
    const f = await fixture();
    const m = model([toolCall(HI_DRAFT_TOOL, { drafts: [TWO[0]] })]);
    const lanes: string[] = [];
    const runner: VerifyRunner = async (cwd) => {
      lanes.push(cwd);
      return { success: true, output: LANE_PASS_OUTPUT };
    };
    const result = await runTask({
      cwd: f.work,
      maxRetries: 1,
      verifyRunner: runner,
      execute: createTaskExecute({ taskText: "add a criterion", env: teamEnv(f), cwd: f.work, fetchImpl: m.fetchImpl, tier: "tool" }),
    });
    expect(result.state).toBe("blocked");
    expect(result.verified).toBe(false);
    expect(result.ask?.question).toContain("• AGENT-20 — ");
    expect(lanes).toEqual([]);
    const [req] = requestsFor(f.work);
    expect(req).toMatchObject({ requester: TEAM, role: "team", drafts: [TWO[0]] });
  });

  test("a community run is never offered it, and a call is refused without recording anything", async () => {
    const f = await fixture();
    const m = model([toolCall(HI_DRAFT_TOOL, { drafts: TWO }), { role: "assistant", content: "I can't draft criteria here." }]);
    const env = discordEnv(f, { CORVIDINHO_ACTING_IS_ADMIN: "0", CORVIDINHO_ACTING_DISCORD_USER_ID: STRANGER, CORVIDINHO_ACTING_ROLE: "community" });
    const exec = createTaskExecute({ taskText: "add a criterion", env, cwd: f.work, fetchImpl: m.fetchImpl, tier: "tool" });
    const r = await exec({ attempt: 1, signal: new AbortController().signal, repoWays: HI_WAYS });
    expect((m.bodies[0]!.tools ?? []).map((t) => t.function.name)).not.toContain(HI_DRAFT_TOOL);
    expect(m.bodies[0]!.messages[0]!.content).toContain("This run can't draft one");
    expect(r.ask).toBeUndefined();
    expect(JSON.stringify(m.bodies[1]!.messages)).toContain("not offered in this run's catalog");
    expect(requestsFor(f.work)).toEqual([]);
  });

  test("a delegate worker in an owner run is never offered it", async () => {
    const f = await fixture();
    const m = model([{ role: "assistant", content: "done" }]);
    const exec = createTaskExecute({
      taskText: "t",
      env: discordEnv(f, { CORVIDINHO_DELEGATE_DEPTH: "1" }),
      cwd: f.work,
      fetchImpl: m.fetchImpl,
      tier: "tool",
    });
    await exec({ attempt: 1, signal: new AbortController().signal, repoWays: HI_WAYS });
    expect((m.bodies[0]!.tools ?? []).map((t) => t.function.name)).not.toContain(HI_DRAFT_TOOL);
  });

  test("bad drafts go back to the model and record nothing: a secret, a captured id, an unknown family", async () => {
    const f = await fixture();
    const cases: Array<[{ id: string; text: string }, string]> = [
      [{ id: "AGENT-20", text: `Push with ${FAKE_TOKEN}.` }, "scrubbing would change is refused (SAFE-6)"],
      [{ id: "AGENT-19", text: "Reworded." }, "AGENT-19 is already captured"],
      [{ id: "NEW-1", text: "A new family." }, "no hi file declares the family NEW"],
    ];
    for (const [draft, why] of cases) {
      const m = model([toolCall(HI_DRAFT_TOOL, { drafts: [draft] }), { role: "assistant", content: "I could not draft that." }]);
      const exec = createTaskExecute({ taskText: "t", env: discordEnv(f), cwd: f.work, fetchImpl: m.fetchImpl, tier: "tool" });
      const r = await exec({ attempt: 1, signal: new AbortController().signal, repoWays: HI_WAYS });
      expect(r.ask).toBeUndefined();
      const toolText = JSON.stringify(m.bodies[1]!.messages.filter((x) => x.role === "tool"));
      expect(toolText).toContain("refused (AGENT-18)");
      expect(toolText).toContain(why);
      expect(toolText).not.toContain(FAKE_TOKEN);
    }
    expect(requestsFor(f.work)).toEqual([]);
  });

  test("the local CLI: the ask lists the exact hi commands, and nothing is recorded or captured", async () => {
    const f = await fixture();
    const m = model([toolCall(HI_DRAFT_TOOL, { drafts: [{ id: "AGENT-20", text: "It's drafted, not captured." }] })]);
    const exec = createTaskExecute({ taskText: "t", env: cliEnv(f), cwd: f.work, fetchImpl: m.fetchImpl, tier: "tool" });
    const r = await exec({ attempt: 1, signal: new AbortController().signal, repoWays: HI_WAYS });
    expect(r.ask?.question).toContain("captured nothing (AGENT-18)");
    expect(r.ask?.question).toContain(`hi AGENT-20 'It'\\''s drafted, not captured.'`);
    expect(requestsFor(f.work)).toEqual([]);
    expect(readFileSync(join(f.work, "hi", "agent.md"), "utf8")).toBe(HI_AGENT);
  });
});

// ------------------------------------------------------------------ the guard

/** Record an approved request for `drafts` in `f.work` and capture it as the card's Approve does. */
function approveAndCapture(f: Fixture, drafts = TWO): string {
  const db = openCorvidinhoDb();
  try {
    const store = new HiCaptureStore({ db });
    const req = store.request({
      repo: realpathSync(join(f.project, ".git")),
      project: "widget",
      worktree: realpathSync(f.work),
      branch: f.branch,
      head: gitIn(f.work, "rev-parse", "HEAD").trim(),
      drafts,
      requester: OWNER,
      role: "owner",
      surface: "chat",
      sessionId: f.sessionId,
    });
    db.transaction(() => {
      expect(store.decide(req.id, "approved", { by: OWNER })).toBe(true);
      runHiCapture({ db, req: store.get(req.id)!, actor: OWNER, env: { PATH: pathWithHi(HI_BIN), HOME: f.base } });
    }).immediate();
    return req.id;
  } finally {
    db.close();
  }
}

function lane() {
  const calls: string[] = [];
  const runner: VerifyRunner = async (cwd) => {
    calls.push(cwd);
    return { success: true, output: LANE_PASS_OUTPUT };
  };
  return { calls, runner };
}

function texts(events: AgentEvent[]): string[] {
  return events.filter((e) => e.type === "Text").map((e) => (e as { text: string }).text);
}

describe("an approved capture passes the hi guard; every other hi/ change still blocks (REQ-agent-522)", () => {
  test("the capture is exactly the drafts, in the session worktree, committed on its branch", async () => {
    const f = await fixture();
    const head = gitIn(f.work, "rev-parse", "HEAD").trim();
    approveAndCapture(f);
    const text = readFileSync(join(f.work, "hi", "agent.md"), "utf8");
    expect(text).toContain("- **AGENT-20**  It drafts criteria and asks before capturing them.");
    expect(text).toContain("  - **AGENT-18.b**  A drafted criterion names the requester's own words.");
    // One commit on the session's branch holds exactly hi/agent.md.
    expect(gitIn(f.work, "rev-parse", "HEAD~1").trim()).toBe(head);
    expect(gitIn(f.work, "diff", "--name-only", "HEAD~1", "HEAD").trim()).toBe("hi/agent.md");
    expect(gitIn(f.work, "status", "--porcelain", "--", "hi").trim()).toBe("");
    // The project checkout is untouched.
    expect(readFileSync(join(f.project, "hi", "agent.md"), "utf8")).toBe(HI_AGENT);
    expect(gitIn(f.project, "rev-parse", "HEAD").trim()).toBe(head);
  });

  test("the next run in that worktree is verified: the gate and hiChangesSince leave the approved capture out", async () => {
    const f = await fixture();
    const base = gitIn(f.work, "rev-parse", "HEAD").trim();
    approveAndCapture(f);
    expect(await hiChangesSince(f.work, base)).toEqual({ criteria: [], retired: [], files: [] });
    const v = lane();
    const events: AgentEvent[] = [];
    const result = await runTask({
      cwd: f.work,
      maxRetries: 0,
      verifyRunner: v.runner,
      onEvent: (e) => events.push(e),
      execute: async () => {
        writeFileSync(join(f.work, "src", "app.ts"), "export const x = 2;\n");
        return { summary: "edited", filesChanged: ["src/app.ts"] };
      },
    });
    expect(result.verified).toBe(true);
    expect(v.calls).toEqual([f.work]);
    expect(texts(events).some((t) => t.startsWith("hi guard"))).toBe(false);
    // With the run's own edit committed on top, it still passes.
    gitIn(f.work, "add", "-A");
    gitIn(f.work, "commit", "-q", "-m", "work");
    expect(await hiChangesSince(f.work, base)).toEqual({ criteria: [], retired: [], files: [] });
  });

  test("an edit on top of an approved capture, another hi/ file, or a step of an unapproved request still blocks", async () => {
    const f = await fixture();
    const base = gitIn(f.work, "rev-parse", "HEAD").trim();
    approveAndCapture(f);
    const agent = join(f.work, "hi", "agent.md");
    writeFileSync(agent, readFileSync(agent, "utf8").replace("## Retired", "- **AGENT-21**  Invented.\n\n## Retired"));
    const mixed = (await hiChangesSince(f.work, base))!;
    expect(mixed.criteria).toContain("AGENT-21");

    const g = await fixture();
    const gBase = gitIn(g.work, "rev-parse", "HEAD").trim();
    approveAndCapture(g);
    writeFileSync(join(g.work, "hi", "notes.md"), "# Notes\n");
    expect((await hiChangesSince(g.work, gBase))!.files).toEqual(["hi/notes.md"]);

    // Ledger steps of a request nobody approved count for nothing.
    const h = await fixture();
    const hBase = gitIn(h.work, "rev-parse", "HEAD").trim();
    const before = readFileSync(join(h.work, "hi", "agent.md"), "utf8");
    const after = before.replace("## Retired", "- **AGENT-22**  Unapproved.\n\n## Retired");
    writeFileSync(join(h.work, "hi", "agent.md"), after);
    const db = openCorvidinhoDb();
    try {
      const store = new HiCaptureStore({ db });
      const req = store.request({
        repo: realpathSync(join(h.project, ".git")),
        project: "widget",
        worktree: realpathSync(h.work),
        branch: h.branch,
        head: hBase,
        drafts: [{ id: "AGENT-22", text: "Unapproved." }],
        requester: OWNER,
        role: "owner",
        surface: "chat",
        sessionId: h.sessionId,
      });
      const { hiContentKey } = await import("../src/agent/hi-capture-store.ts");
      recordHiCaptureFiles(db, req.id, req.repo, [
        { path: "hi/agent.md", before: hiContentKey(before, false)!, after: hiContentKey(after, false)! },
      ]);
    } finally {
      db.close();
    }
    expect((await hiChangesSince(h.work, hBase))!.criteria).toEqual(["AGENT-22"]);
  });

  test("/work opens the PR for a tree whose only hi/ change is the approved capture", async () => {
    const f = await fixture();
    approveAndCapture(f, [TWO[0]!]);
    writeFileSync(join(f.work, "src", "app.ts"), "export const x = 9;\n");
    const calls: string[] = [];
    const deps: OpenWorkPrDeps = {
      allowlist: new Set(["git-commit", "git-push", "github-pr-create"]),
      repoGate: () => ({ ok: true as const, repo: "acme/widget" }),
      verify: async () => ({ success: true, output: LANE_PASS_OUTPUT }),
      // GITHUB-9: shipping cases inject a finished review (same as hi-guard tests).
      reviewed: async () => true,
      runPlugin: async (o: RunOptions): Promise<PluginHandlerResult> => {
        calls.push(o.name);
        return { ok: true, data: { url: "https://github.com/acme/widget/pull/1", number: 1 } };
      },
    };
    const out = await openWorkPr(
      {
        worktreePath: f.work,
        branch: f.branch,
        taskId: "work_hi",
        description: "capture",
        run: { ok: true, exitCode: 0, task: { verified: true, verifySkipped: false, state: "done" } },
      },
      deps,
    );
    expect(out.opened ? "" : out.reason).not.toBe("hi-changed");
    expect(calls).toContain("git-commit");
    expect(existsSync(join(f.work, "hi", "agent.md"))).toBe(true);
  });
});
