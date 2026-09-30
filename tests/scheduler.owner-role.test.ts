/**
 * DISCORD-SCHEDULE-1.a (#124, captured on main from Leif's 2026-09-28
 * interview): "A schedule I create runs with my tools and my allowlist (still
 * never the shell or runners, SAFE-3.a) and asks me through Approve cards
 * where the must-ask list says so; schedules other people create stay
 * read-only."
 *
 * - The scheduler reads the owner live at each run (`loadOwner`, wired by the
 *   bridge and the daemon) and, after the creator / channel gate, stamps the
 *   owner only for the live owner's own schedule (not muted or deny-listed);
 *   anyone else's schedule is community and a schedule is never stamped team.
 * - The spawned run's tool layer resolves that stamp to the owner (or
 *   community), the SAFE-3.a shell gate still refuses the `schedule` surface,
 *   and the schedule's own result post needs no card.
 * - A must-ask call the model starts in the owner's schedule run (a
 *   `discord-post-message`) raises the Approve card; denied or lapsed, the
 *   run ends with a blocking ask naming the refused action, so the next due
 *   tick waits (AUTONOMY-6.a) instead of raising a new card.
 * - An owner schedule on a non-git project keeps its own scoped folder.
 *
 * Fixtures only: memory / temp SQLite stores, a temp allowlist file, a
 * recording agent, a fake spawn bin, an injected fake provider, the real
 * approvals store answered by `tests/fixtures/must-ask.ts`, the daemon and the
 * bridge with a null gateway. No token, no network.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatAskSummary, mustAskRefusedAsk } from "../src/agent/ask.ts";
import { createTaskExecute, type AgentEvent } from "../src/agent/index.ts";
import { runTask } from "../src/agent/loop.ts";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import { startDaemon } from "../src/daemon/index.ts";
import {
  createSpawnAgentClient,
  type AgentClient,
  type AgentRunChatOpts,
} from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import type { OwnerRecord } from "../src/identity/owner.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { MUST_ASK_POST_KIND, setMustAskNotifier } from "../src/plugins/must-ask.ts";
import { clearRegistry } from "../src/plugins/registry.ts";
import { SCHEDULE_SESSION_PREFIX } from "../src/plugins/roles.ts";
import { runPlugin } from "../src/plugins/run.ts";
import type { PluginHandlerResult } from "../src/plugins/types.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore, type Schedule } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { FAKE_LLM_ENV } from "./fixtures/fake-llm.ts";
import { answerMustAsk, MUST_ASK_TEST_OWNER } from "./fixtures/must-ask.ts";

const OWNER_ID = MUST_ASK_TEST_OWNER;
const NEW_OWNER_ID = "700000000000000007";
const TOFU = "200000000000000002"; // declared team
const STRANGER = "500000000000000005"; // undeclared ⇒ community
const CHAN = "600000000000000006";
const OWNER: OwnerRecord = { discordId: OWNER_ID, display: "Leif" };
const HOUR = 3_600_000;
const REPO_ROOT = join(import.meta.dir, "..");

const temps: string[] = [];
function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

/** An allowlist file: the channel, the owner (`owner`), Tofu declared team. */
function allowlistFile(dir: string, owner = OWNER_ID): string {
  const path = join(dir, "allowlist.toml");
  writeFileSync(
    path,
    `[discord]
channels = ["${CHAN}"]
users = []
roles = []
deny_users = []

[owner]
discord_id = "${owner}"
display = "Leif"

[people.tofu]
display = "Tofu"
role = "team"
discord_ids = ["${TOFU}"]
`,
  );
  return path;
}

function allowlistFor(path: string): AllowlistConfig {
  const cfg = emptyConfig();
  cfg.sourcePath = path;
  cfg.discord.channels = [CHAN];
  return cfg;
}

type Post = { channelId: string; content: string; mentionUserIds?: string[]; components?: unknown[] };

function dueSchedule(store: ScheduleStore, createdByUserId: string, over: Partial<Schedule> = {}): Schedule {
  const past = Date.now() - 60_000;
  const s = store.create({
    name: over.name ?? "Nightly digest",
    cronExpression: "0 * * * *",
    project: over.project ?? "proj-a",
    prompt: "summarise yesterday's merged PRs",
    createdByUserId,
    channelId: CHAN,
    now: past - HOUR,
  });
  s.nextRunAt = past;
  return s;
}

async function settled(svc: SchedulerService): Promise<void> {
  for (let i = 0; i < 1000 && svc.runningIds().length > 0; i++) await Bun.sleep(10);
  expect(svc.runningIds()).toEqual([]);
  await svc.settleAskDelivery(2000);
}

/** A scheduler with a recording agent (no worktrees unless `projectRoot`). */
function recordingScheduler(
  store: ScheduleStore,
  opts: {
    owner?: OwnerRecord | null;
    loadOwner?: () => Promise<OwnerRecord | null> | OwnerRecord | null;
    mutedUsers?: Set<string>;
    projectRoot?: string;
  } = {},
) {
  const dir = tempDir("corvidinho-sched-owner-");
  const calls: AgentRunChatOpts[] = [];
  const posts: Post[] = [];
  const svc = new SchedulerService({
    store,
    agent: {
      async runChat(o) {
        calls.push(o);
        return { ok: true, sessionId: o.sessionId, summary: "digest posted", exitCode: 0 };
      },
    },
    allowlist: allowlistFor(allowlistFile(dir)),
    manual: true,
    ...(opts.projectRoot
      ? { useWorktrees: true, defaultProjectRoot: opts.projectRoot }
      : { useWorktrees: false }),
    owner: opts.owner === undefined ? OWNER : opts.owner,
    ...(opts.loadOwner ? { loadOwner: opts.loadOwner } : {}),
    ...(opts.mutedUsers ? { mutedUsers: opts.mutedUsers } : {}),
    outbound: { post: async (p: Post) => void posts.push(p) },
  });
  const tick = async () => {
    await svc.tick();
    await settled(svc);
  };
  return { svc, calls, posts, tick };
}

describe("DISCORD-SCHEDULE-1.a: the scheduler stamps the owner only for the live owner's own schedule", () => {
  test("the owner's own schedule runs with the owner stamp and the schedule surface; its own result post needs no card", async () => {
    const store = new ScheduleStore();
    const s = dueSchedule(store, OWNER_ID);
    const h = recordingScheduler(store, { loadOwner: async () => OWNER });
    await h.tick();
    expect(h.calls).toHaveLength(1);
    const call = h.calls[0]!;
    expect(call.actingIsAdmin).toBe(true);
    expect(call.actingRole).toBeUndefined();
    expect(call.actingUserId).toBe(OWNER_ID);
    expect(call.surface).toBe("schedule");
    expect(call.sessionId).toBe(`${SCHEDULE_SESSION_PREFIX}${s.id}`);
    // The owner's words read as given (SAFE-12), never fenced.
    expect(call.prompt).toContain("summarise yesterday's merged PRs");
    expect(call.prompt).not.toContain("untrusted message");
    // The schedule's own configured-channel post is not an AUTONOMY-10
    // announcement: it goes straight out.
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.channelId).toBe(CHAN);
    expect(h.posts[0]!.content).toStartWith("✅ Schedule **Nightly digest**");
  });

  test("schedules other people create stay read-only: a declared team member's and a stranger's run community, never team", async () => {
    for (const creator of [TOFU, STRANGER]) {
      const store = new ScheduleStore();
      dueSchedule(store, creator);
      const h = recordingScheduler(store, { loadOwner: async () => OWNER });
      await h.tick();
      expect(h.calls).toHaveLength(1);
      expect({ creator, admin: h.calls[0]!.actingIsAdmin, role: h.calls[0]!.actingRole }).toEqual({
        creator,
        admin: false,
        role: undefined,
      });
      expect(h.calls[0]!.surface).toBe("schedule");
    }
  });

  test("the owner is read live: once the config names another owner, the old owner's schedule is community and the new owner's own runs as the owner", async () => {
    const store = new ScheduleStore();
    dueSchedule(store, OWNER_ID, { name: "Old owner's" });
    dueSchedule(store, NEW_OWNER_ID, { name: "New owner's" });
    // Started with OWNER; the config now names NEW_OWNER_ID.
    let reads = 0;
    const h = recordingScheduler(store, {
      owner: OWNER,
      loadOwner: async () => {
        reads += 1;
        return { discordId: NEW_OWNER_ID };
      },
    });
    await h.tick();
    expect(reads).toBe(2);
    const byCreator = Object.fromEntries(h.calls.map((c) => [c.actingUserId, c.actingIsAdmin]));
    expect(byCreator).toEqual({ [OWNER_ID]: false, [NEW_OWNER_ID]: true });
    // The no-longer-owner's schedule reads as a community member's words (SAFE-12).
    const old = h.calls.find((c) => c.actingUserId === OWNER_ID)!;
    expect(old.prompt).toContain("(role: community)");
  });

  test("no owner configured now, an owner read that fails, or a muted owner: community (fail closed)", async () => {
    const cases: Array<{
      why: string;
      loadOwner: () => Promise<OwnerRecord | null>;
      mutedUsers?: Set<string>;
    }> = [
      { why: "no owner", loadOwner: async () => null },
      {
        why: "read fails",
        loadOwner: async () => {
          throw new Error("allowlist file unreadable");
        },
      },
      { why: "muted", loadOwner: async () => OWNER, mutedUsers: new Set([OWNER_ID]) },
    ];
    const logged: string[] = [];
    const origError = console.error;
    console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
    try {
      for (const c of cases) {
        const store = new ScheduleStore();
        dueSchedule(store, OWNER_ID);
        const h = recordingScheduler(store, {
          loadOwner: c.loadOwner,
          ...(c.mutedUsers ? { mutedUsers: c.mutedUsers } : {}),
        });
        await h.tick();
        expect(h.calls).toHaveLength(1);
        expect({ why: c.why, admin: h.calls[0]!.actingIsAdmin }).toEqual({ why: c.why, admin: false });
      }
    } finally {
      console.error = origError;
    }
    expect(logged.some((l) => l.includes("[scheduler] owner failed: allowlist file unreadable"))).toBe(true);
  });

  test("without loadOwner the owner given at start is used (existing callers keep working)", async () => {
    const store = new ScheduleStore();
    dueSchedule(store, OWNER_ID);
    const h = recordingScheduler(store);
    await h.tick();
    expect(h.calls[0]!.actingIsAdmin).toBe(true);
  });

  test("an owner schedule on a non-git project keeps its own scoped folder, never the project folder itself", async () => {
    const root = tempDir("corvidinho-sched-owner-nongit-");
    const project = join(root, "proj");
    mkdirSync(project);
    writeFileSync(join(project, "notes.txt"), "live project file\n");
    const store = new ScheduleStore();
    dueSchedule(store, OWNER_ID, { project: "." });
    const h = recordingScheduler(store, { loadOwner: async () => OWNER, projectRoot: project });
    await h.tick();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.actingIsAdmin).toBe(true);
    const cwd = h.calls[0]!.cwd!;
    expect(cwd).toBeDefined();
    expect(realpathSync(join(cwd, ".."))).not.toBe(realpathSync(project));
    expect(cwd).not.toBe(project);
    expect(cwd.split("/").pop()!.startsWith("scoped-talk-schedule_")).toBe(true);
  });
});

describe("DISCORD-SCHEDULE-1.a: the spawned run's tool layer reads the stamp", () => {
  test("the owner's schedule resolves owner (the shell gate still refuses a scheduled run); a team member's resolves community", async () => {
    const dir = tempDir("corvidinho-sched-owner-spawn-");
    const file = allowlistFile(dir);
    const bin = join(dir, "fake-cli.ts");
    const roles = JSON.stringify(join(REPO_ROOT, "src", "plugins", "roles.ts"));
    const gate = JSON.stringify(join(REPO_ROOT, "src", "agent", "shell-gate.ts"));
    writeFileSync(
      bin,
      `import { resolveActingRole } from ${roles};
import { shellToolsGate } from ${gate};
const role = await resolveActingRole(process.env);
const shell = await shellToolsGate({ env: process.env, cwd: process.cwd() });
console.log("E2E " + JSON.stringify({
  role,
  admin: process.env.CORVIDINHO_ACTING_IS_ADMIN,
  stamp: process.env.CORVIDINHO_ACTING_ROLE,
  surface: process.env.CORVIDINHO_ACTING_SURFACE,
  session: process.env.CORVIDINHO_DISCORD_SESSION_ID,
  shell: shell.granted ? "granted" : shell.reason,
}));
`,
    );
    const agent = createSpawnAgentClient({
      bin,
      cwd: dir,
      env: {
        CORVIDINHO_ALLOWLIST_FILE: file,
        CORVIDINHO_OWNER_DISCORD_ID: "",
        DISCORD_MUTED_USER_IDS: "",
        CORVIDINHO_DISCORD_DENY_USERS: "",
      },
    });
    const summaries = new Map<string, string>();
    const recording: AgentClient = {
      async runChat(o) {
        const r = await agent.runChat(o);
        summaries.set(o.actingUserId ?? "", r.summary);
        return r;
      },
    };
    const store = new ScheduleStore();
    const own = dueSchedule(store, OWNER_ID, { name: "Mine" });
    dueSchedule(store, TOFU, { name: "Tofu's" });
    const svc = new SchedulerService({
      store,
      agent: recording,
      allowlist: allowlistFor(file),
      manual: true,
      useWorktrees: false,
      owner: OWNER,
      loadOwner: async () => OWNER,
    });
    await svc.tick();
    await settled(svc);
    const seen = (who: string) => {
      const m = /E2E (\{.*\})/.exec(summaries.get(who) ?? "");
      expect(m).not.toBeNull();
      return JSON.parse(m![1]!) as Record<string, string>;
    };
    expect(seen(OWNER_ID)).toEqual({
      role: "owner",
      admin: "1",
      stamp: "owner",
      surface: "schedule",
      session: `${SCHEDULE_SESSION_PREFIX}${own.id}`,
      shell: "scheduled runs never get them",
    });
    const team = seen(TOFU);
    expect({ role: team.role, admin: team.admin, stamp: team.stamp, surface: team.surface }).toEqual({
      role: "community",
      admin: "0",
      stamp: "community",
      surface: "schedule",
    });
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Must-ask in the owner's schedule run (AUTONOMY-10 card, SAFE-20 no ⇒ ask)
// ---------------------------------------------------------------------------

/** Keys a run's env sets in process.env (runPlugin and the gate read it); restored after each test. */
const RUN_KEYS = [
  "CORVIDINHO_DATA_DIR",
  "CORVIDINHO_ALLOWLIST",
  "CORVIDINHO_ALLOWLIST_FILE",
  "CORVIDINHO_OWNER_DISCORD_ID",
  "CORVIDINHO_ACTING_IS_ADMIN",
  "CORVIDINHO_ACTING_DISCORD_USER_ID",
  "CORVIDINHO_ACTING_ROLE",
  "CORVIDINHO_ACTING_WORK_TASK",
  "CORVIDINHO_ACTING_SURFACE",
  "CORVIDINHO_DISCORD_SESSION_ID",
  "CORVIDINHO_DISCORD_REPLY_CHANNEL_ID",
  "CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID",
  "CORVIDINHO_DISCORD_ALLOW_CHANNELS",
  "CORVIDINHO_DISCORD_DRY_RUN",
  "CORVIDINHO_DELEGATE_DEPTH",
  "CORVIDINHO_NON_INTERACTIVE",
  "DISCORD_CHANNEL_IDS",
  "DISCORD_MUTED_USER_IDS",
  "DISCORD_TOKEN",
  "DISCORD_BOT_TOKEN",
] as const;

describe("DISCORD-SCHEDULE-1.a: must-ask calls in the owner's schedule run ask on the Approve card; a no ends the run with a blocking ask", () => {
  let saved: Record<string, string | undefined> = {};
  let restoreHooks: (() => void) | null = null;
  const notes: string[] = [];
  let file = "";

  beforeEach(() => {
    saved = {};
    for (const k of RUN_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    const dir = tempDir("corvidinho-sched-owner-mustask-");
    file = allowlistFile(dir);
    Object.assign(process.env, {
      CORVIDINHO_DATA_DIR: join(dir, "data"),
      CORVIDINHO_ALLOWLIST_FILE: file,
      // A real (non dry-run) post: the gate asks before anything is sent.
      DISCORD_TOKEN: "fake-token-not-real",
    });
    notes.length = 0;
    setMustAskNotifier((line) => notes.push(line));
    clearRegistry();
    loadBuiltins();
  });

  afterEach(() => {
    restoreHooks?.();
    restoreHooks = null;
    setMustAskNotifier(null);
    for (const k of RUN_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    clearRegistry();
    loadBuiltins();
  });

  function answer(a: Parameters<typeof answerMustAsk>[0], opts?: { ttlMs?: number }) {
    const h = answerMustAsk(a, opts);
    restoreHooks = h.restore;
    return h.requests;
  }

  /** The env the Discord spawn client gives a run (src/discord/agent-client.ts), in this process. */
  function stampRun(o: Pick<AgentRunChatOpts, "sessionId" | "actingUserId" | "actingIsAdmin" | "actingRole" | "surface">) {
    Object.assign(process.env, {
      CORVIDINHO_DISCORD_SESSION_ID: o.sessionId,
      CORVIDINHO_NON_INTERACTIVE: "1",
      CORVIDINHO_ACTING_DISCORD_USER_ID: o.actingUserId ?? "",
      CORVIDINHO_ACTING_IS_ADMIN: o.actingIsAdmin ? "1" : "0",
      CORVIDINHO_ACTING_ROLE: o.actingIsAdmin ? "owner" : o.actingRole === "team" ? "team" : "community",
      CORVIDINHO_ACTING_WORK_TASK: "0",
      CORVIDINHO_ACTING_SURFACE: o.surface ?? "",
      // A schedule passes no reply channel (REQ-discord-476).
      CORVIDINHO_DISCORD_REPLY_CHANNEL_ID: "",
      CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID: "",
    });
  }

  type Call = { name: string; argv: string[] };
  const POST: Call = {
    name: "discord-post-message",
    argv: ["--channel", CHAN, "--content", "Nightly digest: 3 PRs merged"],
  };
  const SECOND: Call = { name: "memory-recall", argv: ["--query", "digest"] };

  /** Fake provider: the first reply makes `calls`, later replies are plain text. */
  function fakeProvider(calls: Call[]) {
    const seen = { requests: 0, offered: [] as string[] };
    const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
      seen.requests += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: { function: { name: string } }[] };
      if (seen.requests === 1) seen.offered = (body.tools ?? []).map((t) => t.function.name);
      const message =
        seen.requests === 1
          ? {
              role: "assistant",
              content: null,
              tool_calls: calls.map((c, i) => ({
                id: `c${i}`,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify({ argv: c.argv }) },
              })),
            }
          : { role: "assistant", content: "The post was not approved, so nothing went out." };
      return Response.json({ choices: [{ message }] });
    };
    return { fetchImpl, seen };
  }

  async function runOnce(calls: Call[]) {
    const { fetchImpl, seen } = fakeProvider(calls);
    const events: AgentEvent[] = [];
    const cwd = tempDir("corvidinho-sched-owner-run-");
    const execute = createTaskExecute({
      taskText: "post the nightly digest",
      cwd,
      env: { ...process.env, ...FAKE_LLM_ENV },
      fetchImpl,
      tier: "tool",
      nonInteractive: true,
      allowlist: ["discord-post-message"],
      autonomous: false,
      projectInstructions: false,
      onEvent: (e) => events.push(e),
      maxToolRounds: 3,
    });
    const verified: string[] = [];
    const result = await runTask({
      cwd,
      maxRetries: 0,
      execute,
      onEvent: (e) => events.push(e),
      verifyRunner: async (dir) => {
        verified.push(dir);
        return { success: true, output: "ok" };
      },
    });
    const results = events.filter(
      (e): e is Extract<AgentEvent, { type: "ToolResult" }> => e.type === "ToolResult",
    );
    const texts = events.filter((e): e is Extract<AgentEvent, { type: "Text" }> => e.type === "Text").map((e) => e.text);
    return { result, seen, results, texts, verified };
  }

  const OWNER_SCHEDULE = {
    sessionId: `${SCHEDULE_SESSION_PREFIX}sched_owner1`,
    actingUserId: OWNER_ID,
    actingIsAdmin: true,
    surface: "schedule" as const,
  };

  test("denied: the card was raised for the exact post, nothing was posted, and the run ends blocked with a stuck ask naming it", async () => {
    const asked = answer("denied");
    stampRun(OWNER_SCHEDULE);
    const run = await runOnce([POST, SECOND]);
    // The owner's allowlisted tool is in the schedule run's catalog.
    expect(run.seen.offered).toContain("discord-post-message");
    expect(asked).toHaveLength(1);
    expect(asked[0]!.kind).toBe(MUST_ASK_POST_KIND);
    expect(asked[0]!.text).toBe("Nightly digest: 3 PRs merged");
    expect(asked[0]!.requester).toBe(OWNER_ID);
    const post = run.results.find((r) => r.name === "discord-post-message");
    expect(post?.success).toBe(false);
    expect(post?.detail ?? "").toContain("the owner denied it");
    // The run stopped at the refusal: the next call in the batch never ran,
    // and no further model call was made.
    expect(run.results.map((r) => r.name)).toEqual(["discord-post-message"]);
    expect(run.seen.requests).toBe(1);
    expect(run.result.state).toBe("blocked");
    expect(run.verified).toEqual([]);
    const ask = run.result.ask!;
    expect(ask.reason).toBe("stuck");
    expect(ask.question).toContain("`discord-post-message`");
    expect(ask.question).toContain("posts this message in a Discord channel");
    expect(ask.question).toContain(`the owner denied it on Approve card ${asked[0]!.id}`);
    expect(ask.question).toContain("AUTONOMY-10");
    expect(ask.question).toContain("This schedule waits until this is answered");
    expect(run.result.summary).toBe(formatAskSummary(ask));
    expect(run.texts.some((t) => t.startsWith("[operator] DISCORD-SCHEDULE-1.a: discord-post-message was refused"))).toBe(true);
  });

  test("no answer in time (lapsed): a no too — the run ends blocked with a stuck ask saying nobody answered", async () => {
    const asked = answer("none", { ttlMs: 60 });
    stampRun(OWNER_SCHEDULE);
    const run = await runOnce([POST]);
    expect(asked).toHaveLength(1);
    expect(run.result.state).toBe("blocked");
    expect(run.result.ask?.reason).toBe("stuck");
    expect(run.result.ask?.question).toContain(`nobody answered Approve card ${asked[0]!.id} in time (SAFE-20: no answer means no)`);
  });

  test("outside a schedule (the owner's own chat) a denied card leaves the run going: the model sees the refusal, no ask", async () => {
    answer("denied");
    stampRun({ ...OWNER_SCHEDULE, sessionId: "sess_owner_chat", surface: "chat" });
    const run = await runOnce([POST]);
    expect(run.results.find((r) => r.name === "discord-post-message")?.success).toBe(false);
    expect(run.result.ask).toBeUndefined();
    expect(run.result.state).toBe("done");
    expect(run.seen.requests).toBe(2);
  });

  test("another person's schedule never reaches the card: the post is not offered and refused for the role", async () => {
    const asked = answer("approved");
    stampRun({ ...OWNER_SCHEDULE, actingUserId: TOFU, actingIsAdmin: false });
    const run = await runOnce([POST]);
    expect(run.seen.offered).not.toContain("discord-post-message");
    expect(asked).toHaveLength(0);
    // Not in the catalog, so the status shows no name; the call gets the role refusal.
    expect(run.results).toHaveLength(1);
    expect(run.results[0]!.success).toBe(false);
    expect(run.results[0]!.detail ?? "").toContain("not allowed for your role");
    expect(run.result.ask).toBeUndefined();
  });

  test("the owner's schedule is the owner, but it still has no private place: private notes, a --person view, a profile and discord-send-file are refused; project memory is the owner's (MEMORY-6/7.a, DISCORD-17)", async () => {
    stampRun(OWNER_SCHEDULE);
    const cwd = tempDir("corvidinho-sched-owner-private-");
    writeFileSync(join(cwd, "digest.txt"), "nightly digest\n");
    const allowlist = ["discord-send-file"];
    const run = (name: string, args: string[]) =>
      runPlugin({ name, args, nonInteractive: true, allowlist, cwd, json: true });
    // Project memory: the owner's own schedule reads and writes it (MEMORY-6).
    const stored = await run("memory-store", ["--project", "--category", "entity", "--key", "digest", "posted nightly"]);
    expect(stored.ok).toBe(true);
    const recalled = await run("memory-recall", ["--project"]);
    expect(recalled.ok).toBe(true);
    expect(JSON.stringify(recalled.data ?? recalled.message ?? "")).toContain("posted nightly");
    // MEMORY-7 / 7.a: no conversation, so nothing private is read.
    for (const [name, args] of [
      ["memory-recall", ["--category", "private"]],
      ["memory-recall", ["--person", TOFU]],
      ["memory-profile", []],
    ] as const) {
      const r = await run(name, [...args]);
      expect({ name, args, ok: r.ok }).toEqual({ name, args, ok: false });
      expect(r.privateText).toBeUndefined();
      expect(r.error ?? "").toContain("never in a schedule");
    }
    // DISCORD-17: past the role gate, but a schedule has no conversation to attach in.
    const sent = await run("discord-send-file", ["digest.txt"]);
    expect(sent.ok).toBe(false);
    expect(sent.error ?? "").not.toContain("not allowed for your role");
    expect(sent.error ?? "").toContain("no Discord conversation for this run");
  });

  test("the scheduler records that ask: the schedule waits, and the next due tick runs nothing and raises no new card", async () => {
    const asked = answer("denied");
    const db = openCorvidinhoDb({ memory: true });
    try {
      const clock = { now: Date.parse("2026-09-30T10:30:00Z") };
      const store = new ScheduleStore({ db });
      const schedule = store.create({
        name: "Digest",
        cronExpression: "0 * * * *",
        project: "proj-a",
        prompt: "post the nightly digest",
        createdByUserId: OWNER_ID,
        channelId: CHAN,
        now: clock.now,
      });
      let runs = 0;
      const agent: AgentClient = {
        async runChat(o) {
          runs += 1;
          stampRun(o);
          const run = await runOnce([POST]);
          return {
            ok: true,
            sessionId: o.sessionId,
            summary: run.result.summary,
            exitCode: 0,
            ...(run.result.ask ? { ask: run.result.ask } : {}),
          };
        },
      };
      const posts: Post[] = [];
      const svc = new SchedulerService({
        store,
        agent,
        allowlist: allowlistFor(file),
        manual: true,
        useWorktrees: false,
        owner: OWNER,
        loadOwner: async () => OWNER,
        now: () => clock.now,
        outbound: { post: async (p: Post) => void posts.push(p) },
      });
      const due = async () => {
        clock.now += HOUR;
        const r = await svc.tick();
        await settled(svc);
        return r;
      };
      expect((await due()).started).toEqual([schedule.id]);
      expect(runs).toBe(1);
      expect(asked).toHaveLength(1);
      const open = store.openAsk(schedule.id);
      expect(open?.ask.reason).toBe("stuck");
      expect(open?.ask.question).toContain("`discord-post-message`");
      // The ask went to the schedule's channel with its controls, pinging the owner.
      expect(posts).toHaveLength(1);
      expect(posts[0]!.content).toContain("`discord-post-message`");
      expect(posts[0]!.mentionUserIds).toContain(OWNER_ID);
      expect(posts[0]!.components).toBeDefined();

      // Next slot: skipped while the ask is open — no run, no new card, one wait note.
      expect((await due()).skipped).toEqual([schedule.id]);
      expect(runs).toBe(1);
      expect(asked).toHaveLength(1);
      expect(posts).toHaveLength(2);
      expect(posts[1]!.content).toContain("waiting");
      expect((await due()).skipped).toEqual([schedule.id]);
      expect(runs).toBe(1);
      expect(asked).toHaveLength(1);
      expect(posts).toHaveLength(2);
    } finally {
      db.close();
    }
  }, 30_000);
});

describe("mustAskRefusedAsk: only the owner's no becomes the schedule's ask", () => {
  const refused = (outcome: string, extra: Record<string, unknown> = {}): PluginHandlerResult => ({
    ok: false,
    error: "refused",
    exitCode: 2,
    data: { refused: true, rule: "AUTONOMY-9", class: "prod", outcome, why: "`ssh` contacts a remote host (VPS)", request: "apr_1", ...extra },
  });

  test("denied, lapsed and a resent deny give a stuck ask naming the tool, the why, the rule and the card", () => {
    const denied = mustAskRefusedAsk("shell-exec", refused("denied"))!;
    expect(denied).toEqual({
      reason: "stuck",
      question:
        "I didn't run `shell-exec` (`ssh` contacts a remote host (VPS)), which needs the owner's OK (AUTONOMY-9): the owner denied it on Approve card apr_1, so nothing was done. This schedule waits until this is answered: how should it go on?",
    });
    expect(mustAskRefusedAsk("shell-exec", refused("expired"))!.question).toContain(
      "nobody answered Approve card apr_1 in time (SAFE-20: no answer means no)",
    );
    expect(mustAskRefusedAsk("shell-exec", refused("resent"))!.question).toContain(
      "the owner already denied this exact call on Approve card apr_1",
    );
  });

  test("anything else is not: a call that ran, a worker / no-owner / unavailable / aborted refusal, a plain failure", () => {
    expect(mustAskRefusedAsk("x", { ok: true, exitCode: 0, data: { refused: true, outcome: "denied" } })).toBeNull();
    for (const outcome of ["worker", "no-owner", "unavailable", "aborted"]) {
      expect(mustAskRefusedAsk("x", refused(outcome))).toBeNull();
    }
    expect(mustAskRefusedAsk("x", { ok: false, error: "boom", exitCode: 1 })).toBeNull();
    expect(mustAskRefusedAsk("x", { ok: false, error: "boom", exitCode: 1, data: { outcome: "denied" } })).toBeNull();
  });

  test("a long why is cut; secrets in it are scrubbed", () => {
    const long = mustAskRefusedAsk("x", refused("denied", { why: `${"a ".repeat(400)}ghp_${"a1B2c3D4e5".repeat(4).slice(0, 36)}` }))!;
    expect(long.question.length).toBeLessThan(700);
    const token = "gh" + "p_" + "a1B2c3D4e5".repeat(4).slice(0, 36);
    const scrubbed = mustAskRefusedAsk("x", refused("denied", { why: `uses ${token}` }))!;
    expect(scrubbed.question).not.toContain(token);
  });
});

// ---------------------------------------------------------------------------
// The bridge and the daemon wire the live owner
// ---------------------------------------------------------------------------

describe("DISCORD-SCHEDULE-1.a: the daemon and the bridge read the owner live for each run", () => {
  function recorder(calls: AgentRunChatOpts[]): AgentClient {
    return {
      async runChat(o) {
        calls.push(o);
        return { ok: true, sessionId: o.sessionId, summary: "done", exitCode: 0 };
      },
    };
  }

  test("daemon: the owner's schedule runs as the owner; after the file names another owner, the next run is community", async () => {
    const dir = tempDir("corvidinho-sched-owner-daemon-");
    const file = allowlistFile(dir);
    const env = {
      ...process.env,
      CORVIDINHO_DATA_DIR: join(dir, "data"),
      CORVIDINHO_ALLOWLIST_FILE: file,
      CORVIDINHO_OWNER_DISCORD_ID: "",
      CORVIDINHO_DISCORD_ALLOW_USERS: "",
      CORVIDINHO_DISCORD_ALLOW_ROLES: "",
      CORVIDINHO_DISCORD_DENY_USERS: "",
      CORVIDINHO_DISCORD_DENY_ROLES: "",
      CORVIDINHO_DISCORD_ALLOW_CHANNELS: "",
      DISCORD_CHANNEL_IDS: "",
    };
    const db = openCorvidinhoDb({ env });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: OWNER_ID,
      channelId: CHAN,
    });
    const makeDue = () => db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    makeDue();
    const calls: AgentRunChatOpts[] = [];
    const d = await startDaemon({
      env,
      projectRoot: tempDir("corvidinho-sched-owner-daemon-proj-"),
      logger: () => {},
      agent: recorder(calls),
      useWorktrees: false,
      skipProtocolCheck: true,
    });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    try {
      expect((await d.tick()).started).toEqual([s.id]);
      await settled(d.scheduler);
      expect(calls.map((c) => c.actingIsAdmin)).toEqual([true]);

      allowlistFile(dir, NEW_OWNER_ID);
      makeDue();
      expect((await d.tick()).started).toEqual([s.id]);
      await settled(d.scheduler);
      expect(calls.map((c) => c.actingIsAdmin)).toEqual([true, false]);
    } finally {
      await d.stop();
      db.close();
    }
  }, 30_000);

  test("bridge: the owner's schedule runs as the owner; after the file names another owner, the next run is community", async () => {
    const dir = tempDir("corvidinho-sched-owner-bridge-");
    const file = allowlistFile(dir);
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "nightly",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: OWNER_ID,
      channelId: CHAN,
    });
    const makeDue = () => db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    const calls: AgentRunChatOpts[] = [];
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: CHAN,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: file,
      },
      db,
      scheduleStore: store,
      projectRoot: tempDir("corvidinho-sched-owner-bridge-proj-"),
      skipProtocolCheck: true,
      schedulerPollIntervalMs: 20,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: recorder(calls),
      gatewayFactory: async (_cfg, handlers) => {
        handlers.reply = async () => ({ messageId: "bot_1" });
        return createNullGateway();
      },
    });
    if (!result.ok) throw new Error("bridge did not start");
    try {
      makeDue();
      for (let i = 0; i < 300 && calls.length < 1; i++) await Bun.sleep(20);
      expect(calls.map((c) => c.actingIsAdmin)).toEqual([true]);

      allowlistFile(dir, NEW_OWNER_ID);
      // Let the first run finish before the slot comes due again.
      await Bun.sleep(100);
      makeDue();
      for (let i = 0; i < 300 && calls.length < 2; i++) await Bun.sleep(20);
      expect(calls.map((c) => c.actingIsAdmin)).toEqual([true, false]);
    } finally {
      await result.stop();
      db.close();
    }
  }, 30_000);
});
