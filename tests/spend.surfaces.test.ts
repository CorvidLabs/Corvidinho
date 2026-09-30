/**
 * AUTONOMY-8 (#98, REQ-agent-199 / REQ-watch-099 / REQ-discord-199) — "It
 * asks before any spend that would go over a cap", on every surface.
 *
 * Every surface runs the agent as `corvidinho task run` (createTaskExecute),
 * so the spend guard is the one gate. This file checks that no surface's
 * spawn env gets around it: each surface's real spawner (the Discord spawn
 * client for chat, slash `/session` and `/work`, ask buttons, schedules and
 * the daemon, which runs schedules through the same client; the WATCH spawn
 * client; delegate / council workers from `buildDelegateSpawn`; the CLI with
 * its own env) is run against a stand-in `corvidinho` that only records the
 * env it was given, and that env then drives `createTaskExecute` with a
 * mocked provider. For each surface and each kind of cap — the total cap,
 * a provider cap (SAFE-14) and an unpriced model under a cap (SAFE-16.a) —
 * the provider is not called before the owner's spend card is decided, the
 * card names the surface, and a no leaves nothing spent with a `spend-cap`
 * ask; with no owner the run stops at once with the operator ask.
 *
 * It also covers the hand-over of a WATCH run's spend-cap stop to the owner
 * (the poller records it; the bridge DMs the stop's details once per cap
 * episode) and that a schedule's spend-cap stop can go on through the card
 * (the owner's Continue; tests/discord.schedule-ask.test.ts presses it).
 *
 * Temp dirs, a stand-in bin, in-memory or temp-dir SQLite, a mocked fetch and
 * a recording DM; no network, no token.
 */
import type { Database } from "bun:sqlite";
import { afterEach, beforeAll, afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskExecute } from "../src/agent/execute.ts";
import { runTask } from "../src/agent/loop.ts";
import {
  PROVIDER_SPEND_CAPS_ENV,
  setSpendCardTestHooks,
  SPEND_CAP_ENV,
  type SpendFetch,
} from "../src/agent/spend.ts";
import {
  SPEND_CAP_SUMMARY,
  SPEND_PAUSED_TEXT,
  spendCapReachedAsk,
  spendCapUnpricedAsk,
} from "../src/agent/spend-notice.ts";
import { createSpendAlertOutbox } from "../src/agent/spend-outbox.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import { ApprovalStore, type ApprovalRequest } from "../src/approvals/store.ts";
import { buildDelegateSpawn } from "../src/autonomous/delegate.ts";
import { createSpawnAgentClient as createDiscordClient } from "../src/discord/agent-client.ts";
import { scheduleAskComponents } from "../src/discord/schedule-ask.ts";
import { SPEND_STOP_DM_HEAD } from "../src/discord/spend-dm.ts";
import { createWatchAskDelivery } from "../src/discord/watch-ask.ts";
import { SCHEDULE_SESSION_PREFIX } from "../src/plugins/roles.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import { createSpawnAgentClient as createWatchClient, type AgentClient as WatchAgent } from "../src/watch/agent-client.ts";
import { markBridgeRunning, noteWatchRunAsk, WatchOwnerAskStore } from "../src/watch/owner-ask.ts";
import { startWatchPoller, type StartWatchResult } from "../src/watch/poller.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const OWNER = "181969874455756800";
const HOST = "llm.test";
const PRICED = "gpt-4o";
const UNPRICED = "local-llama-70b";
const REPO = "CorvidLabs/Corvidinho";

let root = "";
let bin = "";
const dirs: string[] = [];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "corvidinho-spend-surfaces-"));
  bin = join(root, "fake-corvidinho.ts");
  // A stand-in `corvidinho`: records the env its spawner gave `task run`.
  writeFileSync(
    bin,
    'import { writeFileSync } from "node:fs";\n' +
      "writeFileSync(process.env.SPEND_SURFACE_ENV_OUT!, JSON.stringify(process.env));\n" +
      'console.log("recorded");\n',
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  setSpendCardTestHooks({});
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix = "corvidinho-spend-surface-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

type Cap = "total" | "provider" | "unpriced";

/** What the operator's process env holds for one case (the parent of every spawner). */
function parentEnv(dataDir: string, cap: Cap, owner = true): Record<string, string> {
  return {
    CORVIDINHO_DATA_DIR: dataDir,
    CORVIDINHO_ALLOWLIST_FILE: join(dataDir, "none.toml"),
    CORVIDINHO_LLM_API_KEY: "test-key",
    CORVIDINHO_LLM_BASE_URL: `https://${HOST}/v1`,
    CORVIDINHO_LLM_MODEL: cap === "unpriced" ? UNPRICED : PRICED,
    CORVIDINHO_LLM_TIER: "read",
    ...(owner ? { CORVIDINHO_OWNER_DISCORD_ID: OWNER } : {}),
    ...(cap === "provider" ? { [SPEND_CAP_ENV]: "", [PROVIDER_SPEND_CAPS_ENV]: `${HOST}=0` } : { [SPEND_CAP_ENV]: cap === "unpriced" ? "5" : "0" }),
  };
}

type Surface = {
  name: string;
  /** The card's `from <surface>` (auditContextFromEnv). */
  from: RegExp;
  /** The env this surface's spawner gives `task run`. */
  env: (parent: Record<string, string>) => Promise<Record<string, string>>;
};

async function viaDiscord(
  parent: Record<string, string>,
  o: { sessionId: string; surface: string; workTask?: boolean },
): Promise<Record<string, string>> {
  const out = join(tmp(), "env.json");
  const client = createDiscordClient({ bin, cwd: root, env: { ...parent, SPEND_SURFACE_ENV_OUT: out } });
  await client.runChat({
    prompt: "tidy the README",
    humanText: "tidy the README",
    sessionId: o.sessionId,
    actingUserId: OWNER,
    actingIsAdmin: true,
    surface: o.surface as never,
    ...(o.workTask ? { workTask: true } : {}),
  });
  return JSON.parse(readFileSync(out, "utf8")) as Record<string, string>;
}

const SURFACES: Surface[] = [
  { name: "chat", from: /from discord:sess_chat$/, env: (p) => viaDiscord(p, { sessionId: "sess_chat", surface: "chat" }) },
  { name: "slash /session", from: /from discord:sess_slash$/, env: (p) => viaDiscord(p, { sessionId: "sess_slash", surface: "session" }) },
  { name: "slash /work", from: /from discord:work_1$/, env: (p) => viaDiscord(p, { sessionId: "work_1", surface: "work", workTask: true }) },
  { name: "ask buttons", from: /from discord:sess_btn$/, env: (p) => viaDiscord(p, { sessionId: "sess_btn", surface: "ask" }) },
  {
    name: "schedules",
    from: /from discord:schedule_s1$/,
    env: (p) => viaDiscord(p, { sessionId: `${SCHEDULE_SESSION_PREFIX}s1`, surface: "schedule" }),
  },
  {
    // `corvidinho daemon` runs schedules through the same Discord spawn client (src/daemon/daemon.ts).
    name: "daemon",
    from: /from discord:schedule_d1$/,
    env: (p) => viaDiscord(p, { sessionId: `${SCHEDULE_SESSION_PREFIX}d1`, surface: "schedule" }),
  },
  {
    name: "WATCH",
    from: /from watch:watch_7$/,
    env: async (p) => {
      const out = join(tmp(), "env.json");
      const client = createWatchClient({ bin, cwd: root, env: { ...p, SPEND_SURFACE_ENV_OUT: out } });
      await client.runChat({ prompt: "look at #7", sessionId: "watch_7", actingGithubLogin: "tofu-dev", repo: REPO });
      return JSON.parse(readFileSync(out, "utf8")) as Record<string, string>;
    },
  },
  {
    name: "CLI",
    from: /from cli$/,
    env: async (p) => ({ ...(process.env as Record<string, string>), ...p }),
  },
  {
    name: "delegate / council worker",
    from: /from discord:sess_lead$/,
    env: async (p) => {
      // A worker started by an owner chat run (council voices spawn the same way).
      const lead = await viaDiscord(p, { sessionId: "sess_lead", surface: "chat" });
      return buildDelegateSpawn({ bin, taskText: "one voice", tier: "read", childDepth: 1, allowlist: [], baseEnv: lead }).env;
    },
  },
];

function recordingFetch(): { fetch: SpendFetch; hosts: string[] } {
  const hosts: string[] = [];
  const fetch: SpendFetch = async (input) => {
    hosts.push(new URL(String(input)).host);
    return Response.json({ choices: [{ message: { content: "ok" } }] });
  };
  return { fetch, hosts };
}

/** Deny each card as it is recorded, noting how many provider calls had gone out by then. */
function denyCards(hosts: string[]): Array<{ req: ApprovalRequest; sentBefore: number }> {
  const seen: Array<{ req: ApprovalRequest; sentBefore: number }> = [];
  setSpendCardTestHooks({
    ttlMs: 2_000,
    pollMs: 5,
    onRequest: (req, db) => {
      seen.push({ req, sentBefore: hosts.length });
      new ApprovalStore({ db }).decide(req.id, "denied", { by: OWNER });
    },
  });
  return seen;
}

describe("AUTONOMY-8: every surface stops and asks before spending over any cap", () => {
  for (const surface of SURFACES) {
    for (const cap of ["total", "provider", "unpriced"] as const) {
      test(`${surface.name} — ${cap === "unpriced" ? "an unpriced model under a cap (SAFE-16.a)" : `past the ${cap} cap`}: the owner's card first, nothing spent on a no`, async () => {
        const dataDir = tmp();
        const env = await surface.env(parentEnv(dataDir, cap));
        const { fetch, hosts } = recordingFetch();
        const cards = denyCards(hosts);
        const result = await runTask({
          cwd: dataDir,
          execute: createTaskExecute({
            taskText: "tidy the README",
            cwd: dataDir,
            env,
            fetchImpl: fetch,
            loadPlugins: false,
            projectInstructions: false,
          }),
          verifyRunner: async () => ({ success: true, output: "" }),
        });
        expect(hosts).toEqual([]);
        expect(cards).toHaveLength(1);
        const { req, sentBefore } = cards[0]!;
        expect(sentBefore).toBe(0);
        expect(req.kind).toBe("spend");
        expect(req.class).toBe("money");
        expect(req.title).toMatch(surface.from);
        expect(req.target).toBe(cap === "provider" ? `provider:${HOST}` : "total");
        // SAFE-16.a: an unpriced call's card shows the amount as unknown, never $0.
        expect(req.amount.startsWith("unknown")).toBe(cap === "unpriced");
        expect(result.state).toBe("blocked");
        expect(result.summary).toBe(SPEND_CAP_SUMMARY);
        expect(result.ask?.reason).toBe("spend-cap");
        expect(result.ask?.question).toContain(`The owner denied Approve card ${req.id}`);
      });
    }
  }

  for (const surface of SURFACES) {
    test(`${surface.name} — no owner configured (nobody can approve): it stops at once, before the provider, with the operator ask`, async () => {
      for (const cap of ["total", "unpriced"] as const) {
        const dataDir = tmp();
        const env = await surface.env(parentEnv(dataDir, cap, false));
        const { fetch, hosts } = recordingFetch();
        const cards = denyCards(hosts);
        const r = await createTaskExecute({
          taskText: "tidy the README",
          cwd: dataDir,
          env,
          fetchImpl: fetch,
          loadPlugins: false,
          projectInstructions: false,
        })({ attempt: 1, signal: new AbortController().signal });
        expect({ cap, hosts, cards: cards.length, reason: r.ask?.reason }).toEqual({
          cap,
          hosts: [],
          cards: 0,
          reason: "spend-cap",
        });
        expect(r.ask?.question).toContain("Replying can't lift the cap");
      }
    });
  }
});

// ─── WATCH: a spend-cap stop reaches the owner (REQ-watch-099 / REQ-discord-199) ───

const CAP_STOP: HumanAsk = spendCapReachedAsk({
  spentMicroUsd: 4_999_000,
  estimateMicroUsd: 2_600,
  capMicroUsd: 5_000_000,
  card: { requestId: "apr_1", outcome: "expired" },
});

function ev(over: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    id: "comment-1",
    type: "issue_comment",
    body: "@corvid-agent please look",
    sender: "tofu-dev",
    repo: REPO,
    number: 7,
    title: "Fix the crash",
    htmlUrl: `https://github.com/${REPO}/issues/7#issuecomment-1`,
    createdAt: "2026-09-30T12:00:00Z",
    isPullRequest: false,
    ...over,
  };
}

describe("WATCH: a run stopped at a spend cap is handed to the bridge, which DMs the owner once per cap episode", () => {
  const running: Array<Extract<StartWatchResult, { ok: true }>> = [];
  const dbs: Database[] = [];
  afterEach(async () => {
    for (const r of running.splice(0)) await r.stop();
    for (const db of dbs.splice(0)) db.close();
  });

  function memDb(): Database {
    const db = openCorvidinhoDb({ memory: true });
    dbs.push(db);
    return db;
  }

  test("the poller records the stop; the GitHub comment says only that work is paused for budget; the log names no amount", async () => {
    const db = memDb();
    markBridgeRunning(db);
    const dir = tmp();
    const allowlist = join(dir, "allowlist.toml");
    writeFileSync(
      allowlist,
      `[github]\nrepos = ["${REPO}"]\nusers = ["tofu-dev"]\n\n[owner]\ndiscord_id = "${OWNER}"\ngithub_login = "0xleif"\n`,
    );
    // The run's own summary is the generic one (SAFE-14.a); the ask carries the details.
    const agent: WatchAgent = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: SPEND_CAP_SUMMARY, exitCode: 0, ask: CAP_STOP };
      },
    };
    const ack = createEchoAckClient();
    const logs: string[] = [];
    let round = 0;
    const result = await startWatchPoller({
      env: { GITHUB_TOKEN: "fake", CORVIDINHO_WATCH_USERNAME: "corvid-agent", CORVIDINHO_WATCH_DRY_RUN: "1", HOME: dir },
      filePath: allowlist,
      runLoop: false,
      agent,
      ackClient: ack,
      db,
      log: (m) => logs.push(m),
      logError: (m) => logs.push(m),
      fetchEvents: async () => (round++ === 0 ? [ev()] : []),
    });
    if (!result.ok) throw new Error(result.message);
    running.push(result);
    await result.pollOnce();
    const pending = new WatchOwnerAskStore(db).pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.ask.reason).toBe("spend-cap");
    expect(pending[0]!.ask.question).toContain("Stopped at cap: total.");
    const line = logs.find((l) => l.includes("spend-cap stop"))!;
    expect(line).toContain(`[watch] spend-cap stop ${REPO}#7`);
    expect(line).toContain("queued for the owner's Discord DM (AUTONOMY-8)");
    expect(line).not.toMatch(/\$\d|CORVIDINHO_/);
    const summary = ack.posts.find((p) => p.body.startsWith("Corvidinho WATCH run summary"));
    expect(summary?.body).toContain(SPEND_PAUSED_TEXT);
    for (const p of ack.posts) expect(p.body).not.toMatch(/\$\d|CORVIDINHO_DAILY|Stopped at cap/);
  });

  test("noteWatchRunAsk: no owner or no bridge says so without amounts; a later run that is not stopped drops it", () => {
    const db = memDb();
    const logs: string[] = [];
    const base = { db, event: ev(), summaryPosted: true, now: 1, log: (m: string) => logs.push(m) };
    expect(noteWatchRunAsk({ ...base, owner: null, ask: CAP_STOP })).toEqual({ kind: "not-sent", why: "no-owner" });
    expect(noteWatchRunAsk({ ...base, owner: { discordId: OWNER }, ask: CAP_STOP, isAlive: () => false })).toEqual({
      kind: "no-bridge",
    });
    expect(logs.join("\n")).toContain("GitHub shows only that work is paused for budget (SAFE-14.a)");
    expect(logs.join("\n")).not.toMatch(/\$\d/);
    expect(new WatchOwnerAskStore(db).pending()).toHaveLength(1);
    expect(noteWatchRunAsk({ ...base, owner: { discordId: OWNER }, ask: undefined })).toEqual({ kind: "none", cleared: true });
    // An event with no summary comment (an assignment, a review request): the log does not claim GitHub shows the pause.
    logs.length = 0;
    expect(
      noteWatchRunAsk({ ...base, summaryPosted: false, owner: { discordId: OWNER }, ask: CAP_STOP, isAlive: () => false }),
    ).toEqual({ kind: "no-bridge" });
    expect(logs.join("\n")).toContain("no comment on GitHub carries it (SAFE-14.a)");
    expect(logs.join("\n")).not.toContain("GitHub shows only");
    expect(logs.join("\n")).not.toMatch(/\$\d/);
  });

  test("a stop while the owner's DM is in flight hands back the ask and its cap episode, so the next start DMs it instead of dropping it", async () => {
    const db = memDb();
    const store = new WatchOwnerAskStore(db);
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" }, now: () => 10 });
    store.record({ event: ev(), ask: CAP_STOP, now: 5 });
    let started = false;
    const first = createWatchAskDelivery({
      db,
      owner: () => ({ discordId: OWNER }),
      sendDm: () => () => {
        started = true;
        return new Promise(() => {});
      },
      now: () => 10,
      log: () => {},
      spendAlerts: outbox,
    });
    void first.deliver();
    await Bun.sleep(10);
    expect(started).toBe(true);
    expect(store.pending()).toEqual([]);
    first.stop();
    expect(await first.settle(20)).toBe(false);
    expect(store.pending()).toHaveLength(1);
    // The next start: the owner gets the DM (the episode was handed back too).
    const dms: Array<{ userId: string; content: string }> = [];
    const logs: string[] = [];
    const next = createWatchAskDelivery({
      db,
      owner: () => ({ discordId: OWNER }),
      sendDm: () => async (o) => {
        dms.push(o);
        return { channelId: "dm", messageId: `m${dms.length}` };
      },
      now: () => 10,
      log: (m) => logs.push(m),
      spendAlerts: outbox,
    });
    expect(await next.deliver()).toEqual({ sent: 1, failed: 0, expired: 0 });
    expect(dms).toHaveLength(1);
    expect(dms[0]!.content).toStartWith(SPEND_STOP_DM_HEAD);
    expect(logs.some((l) => l.includes("already told about this cap episode"))).toBe(false);
    // Told now: another stop in the same episode is not DMed again.
    store.record({ event: ev({ id: "comment-3", number: 9 }), ask: CAP_STOP, now: 6 });
    expect(await next.deliver()).toEqual({ sent: 0, failed: 0, expired: 0 });
    expect(dms).toHaveLength(1);
  });

  test("the bridge DMs the owner the stop's details with the GitHub thread; a second stop in the same cap episode is not DMed again; a failed DM hands both back", async () => {
    const db = memDb();
    const store = new WatchOwnerAskStore(db);
    const outbox = createSpendAlertOutbox({ db, env: { [SPEND_CAP_ENV]: "5" }, now: () => 10 });
    let fail = true;
    const dms: Array<{ userId: string; content: string }> = [];
    const logs: string[] = [];
    const delivery = createWatchAskDelivery({
      db,
      owner: () => ({ discordId: OWNER }),
      sendDm: () => async (o) => {
        if (fail) return null;
        dms.push(o);
        return { channelId: "dm", messageId: `m${dms.length}` };
      },
      now: () => 10,
      log: (m) => logs.push(m),
      spendAlerts: outbox,
    });
    store.record({ event: ev(), ask: CAP_STOP, now: 5 });
    expect(await delivery.deliver()).toEqual({ sent: 0, failed: 1, expired: 0 });
    // Handed back: the ask and the episode's ping both wait for the next try.
    expect(store.pending()).toHaveLength(1);
    fail = false;
    const retry = createWatchAskDelivery({
      db,
      owner: () => ({ discordId: OWNER }),
      sendDm: () => async (o) => {
        dms.push(o);
        return { channelId: "dm", messageId: `m${dms.length}` };
      },
      now: () => 10,
      log: (m) => logs.push(m),
      spendAlerts: outbox,
    });
    expect(await retry.deliver()).toEqual({ sent: 1, failed: 0, expired: 0 });
    expect(dms).toHaveLength(1);
    const dm = dms[0]!.content;
    expect(dm).toStartWith(SPEND_STOP_DM_HEAD);
    expect(dm.split("\n")[1]).toBe(`GitHub ${REPO}#7: https://github.com/${REPO}/issues/7#issuecomment-1`);
    expect(dm).toContain("> Daily spend cap reached (SAFE-8): $4.9990 spent in the last 24h");
    expect(dm).not.toContain("<@");
    // Another thread stopped at the same cap in the same episode: taken, not DMed again.
    store.record({ event: ev({ id: "comment-2", number: 8 }), ask: CAP_STOP, now: 6 });
    expect(await retry.deliver()).toEqual({ sent: 0, failed: 0, expired: 0 });
    expect(dms).toHaveLength(1);
    expect(store.pending()).toEqual([]);
    expect(logs.some((l) => l.includes("already told about this cap episode"))).toBe(true);
  });
});

describe("schedules: a spend-cap stop can go on through the card (AUTONOMY-8, AUTONOMY-6.a)", () => {
  test("its controls are the owner's Continue and Cancel, for a priced and an unpriced stop; the post text stays the pause", () => {
    for (const ask of [CAP_STOP, spendCapUnpricedAsk(UNPRICED, 5_000_000, "CORVIDINHO_LLM_MODEL", "total", { outcome: "denied" })]) {
      const labels = scheduleAskComponents("srun_0123456789ab", ask)[0]!.components.map((b) => b.label);
      expect(labels).toEqual(["Continue", "Cancel"]);
    }
    expect(SPEND_PAUSED_TEXT).toBe("Work is paused for budget.");
  });
});
