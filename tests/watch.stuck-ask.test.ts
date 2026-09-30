/**
 * AGENT-16.a (#86, REQ-watch-086 / REQ-discord-086): when a GitHub run is
 * stuck and needs me, it pings me on Discord like other stuck asks.
 *
 * The WATCH poller (injected events, a stub agent, the echo ack client, an
 * in-memory shared DB) hands a stuck run's ask to the bridge through the DB
 * for every event type; the bridge (dry-run gateway stub capturing DMs) DMs
 * the owner on its scheduler tick. No network, no real token.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resultFrame, serializeFrame } from "../src/agent/events-ndjson.ts";
import { formatAskSummary, stuckAfterVerifyAsk } from "../src/agent/ask.ts";
import { repeatedFailureAsk } from "../src/agent/loop-guards.ts";
import type { HumanAsk, TaskResult } from "../src/agent/types.ts";
import type { AgentClient as DiscordAgent } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway } from "../src/discord/gateway.ts";
import {
  createWatchAskDelivery,
  formatWatchStuckAskDm,
  WATCH_ASK_RETRY_MS,
} from "../src/discord/watch-ask.ts";
import { scheduleRunnerId } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { rescrubDatabase, SCRUB_TARGETS } from "../src/store/scrub.ts";
import { createEchoAckClient } from "../src/watch/ack.ts";
import {
  createSpawnAgentClient,
  type AgentClient as WatchAgent,
} from "../src/watch/agent-client.ts";
import {
  BRIDGE_RUNNER_META_KEY,
  bridgeRunning,
  clearBridgeRunning,
  markBridgeRunning,
  noteWatchRunAsk,
  threadUrl,
  WATCH_OWNER_ASK_TTL_MS,
  WatchOwnerAskStore,
  type WatchOwnerAsk,
} from "../src/watch/owner-ask.ts";
import { startWatchPoller, type StartWatchResult } from "../src/watch/poller.ts";
import type { DetectedEvent } from "../src/watch/types.ts";

const REPO = "CorvidLabs/Corvidinho";
const OWNER_ID = "111122223333444455";
const FAKE_TOKEN = `ghp_${"b".repeat(36)}`;

const dirs: string[] = [];
const dbs: Database[] = [];
const running: Array<Extract<StartWatchResult, { ok: true }>> = [];
afterEach(async () => {
  for (const r of running.splice(0)) await r.stop();
  for (const db of dbs.splice(0)) {
    try {
      db.close();
    } catch {
      // closed by the test
    }
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix = "corvidinho-watch-stuck-"): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function memDb(): Database {
  const db = openCorvidinhoDb({ memory: true });
  dbs.push(db);
  return db;
}

function allowlistFile(withOwner = true): string {
  const path = join(tmp(), "allowlist.toml");
  writeFileSync(
    path,
    `[github]
repos = ["${REPO}"]
users = ["tofu-dev"]
${withOwner ? `\n[owner]\ndiscord_id = "${OWNER_ID}"\ngithub_login = "0xleif"\n` : ""}`,
  );
  return path;
}

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

/** A stub WATCH agent whose runs end with `asks` in order (undefined = no ask). */
function agentAsking(asks: Array<HumanAsk | undefined>): WatchAgent {
  let i = 0;
  return {
    async runChat({ sessionId }) {
      const ask = asks[Math.min(i++, asks.length - 1)];
      return {
        ok: !ask || ask.reason !== "stuck",
        sessionId,
        summary: ask ? formatAskSummary(ask) : "Fixed the crash.",
        exitCode: ask?.reason === "stuck" ? 1 : 0,
        ...(ask ? { ask } : {}),
      };
    },
  };
}

async function poller(opts: {
  db: Database;
  asks: Array<HumanAsk | undefined>;
  events: DetectedEvent[][];
  withOwner?: boolean;
}) {
  const ack = createEchoAckClient();
  const logs: string[] = [];
  let round = 0;
  const result = await startWatchPoller({
    env: {
      GITHUB_TOKEN: "fake",
      CORVIDINHO_WATCH_USERNAME: "corvid-agent",
      CORVIDINHO_WATCH_DRY_RUN: "1",
      HOME: tmp(),
    },
    filePath: allowlistFile(opts.withOwner !== false),
    runLoop: false,
    agent: agentAsking(opts.asks),
    ackClient: ack,
    db: opts.db,
    log: (m) => logs.push(m),
    logError: (m) => logs.push(m),
    fetchEvents: async () => opts.events[round++] ?? [],
  });
  if (!result.ok) throw new Error(result.message);
  running.push(result);
  return { result, ack, logs };
}

const STUCK = repeatedFailureAsk("files-read");

describe("WATCH: a stuck run is handed to the bridge for the owner's Discord ping (REQ-watch-086)", () => {
  test("an assignment (no summary comment today) that ends stuck is queued; with no bridge a log line says the ping could not be sent", async () => {
    const db = memDb();
    const { result, ack, logs } = await poller({
      db,
      asks: [STUCK],
      events: [[ev({ id: "assign-1", type: "assignment", actor: "tofu-dev", body: "" })]],
    });
    await result.pollOnce();
    const pending = new WatchOwnerAskStore(db).pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      id: `issue:${REPO.toLowerCase()}#7`,
      repo: REPO,
      number: 7,
      eventId: "assign-1",
      eventType: "assignment",
      htmlUrl: `https://github.com/${REPO}/issues/7#issuecomment-1`,
      ask: STUCK,
    });
    // An assignment posts no ack or summary on GitHub.
    expect(ack.posts).toHaveLength(0);
    const line = logs.find((l) => l.startsWith("[watch] stuck ask "));
    expect(line).toBe(
      `[watch] stuck ask ${REPO}#7 id=assign-1: the owner's Discord ping could not be sent — no Discord bridge is running ` +
        "on this data dir (CORVIDINHO_DATA_DIR); it is sent if one starts within a day; no comment on GitHub carries the question (AGENT-16.a)",
    );
  });

  test("with a live bridge on the data dir an issue comment's stuck ask is queued; its summary comment still carries the question", async () => {
    const db = memDb();
    markBridgeRunning(db);
    const { result, ack, logs } = await poller({ db, asks: [STUCK], events: [[ev()]] });
    await result.pollOnce();
    expect(new WatchOwnerAskStore(db).pending().map((a) => a.ask)).toEqual([STUCK]);
    expect(logs).toContain(`[watch] stuck ask ${REPO}#7 id=comment-1: queued for the owner's Discord ping (AGENT-16.a)`);
    const summary = ack.posts.find((p) => p.body.startsWith("Corvidinho WATCH run summary"));
    expect(summary?.body).toContain(formatAskSummary(STUCK));
  });

  test("every event type queues it: a review request and a verify-exhausted stuck ask too", async () => {
    const db = memDb();
    const { result } = await poller({
      db,
      asks: [stuckAfterVerifyAsk(2)],
      events: [[ev({ id: "reviewreq-1", type: "review_request", actor: "tofu-dev", number: 9, isPullRequest: true, htmlUrl: "" })]],
    });
    await result.pollOnce();
    const pending = new WatchOwnerAskStore(db).pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.ask).toEqual(stuckAfterVerifyAsk(2));
    // No GitHub link from the event: the thread's own URL.
    expect(pending[0]!.htmlUrl).toBe(threadUrl(REPO, 9));
  });

  test("a clarify ask is the commenter's to answer (never queued); a later run on the thread that is not stuck drops a pending one", async () => {
    const db = memDb();
    const { result, logs } = await poller({
      db,
      asks: [STUCK, undefined, { reason: "clarify", question: "Which branch?" }],
      events: [[ev({ id: "comment-1" })], [ev({ id: "comment-2" })], [ev({ id: "comment-3" })]],
    });
    await result.pollOnce();
    expect(new WatchOwnerAskStore(db).pending()).toHaveLength(1);
    await result.pollOnce();
    expect(new WatchOwnerAskStore(db).pending()).toEqual([]);
    await result.pollOnce();
    expect(new WatchOwnerAskStore(db).pending()).toEqual([]);
    expect(logs.filter((l) => l.startsWith("[watch] stuck ask "))).toHaveLength(1);
  });

  test("a later spawn that throws (no run finished) leaves the pending ask", async () => {
    const db = memDb();
    let runs = 0;
    const agent: WatchAgent = {
      async runChat({ sessionId }) {
        runs += 1;
        if (runs > 1) throw new Error("spawn failed");
        return { ok: false, sessionId, summary: formatAskSummary(STUCK), exitCode: 1, ask: STUCK };
      },
    };
    let round = 0;
    const events = [[ev({ id: "comment-1" })], [ev({ id: "comment-2" })]];
    const result = await startWatchPoller({
      env: { GITHUB_TOKEN: "fake", CORVIDINHO_WATCH_USERNAME: "corvid-agent", CORVIDINHO_WATCH_DRY_RUN: "1", HOME: tmp() },
      filePath: allowlistFile(),
      runLoop: false,
      agent,
      ackClient: createEchoAckClient(),
      db,
      log: () => {},
      logError: () => {},
      fetchEvents: async () => events[round++] ?? [],
    });
    if (!result.ok) throw new Error(result.message);
    running.push(result);
    await result.pollOnce();
    await result.pollOnce();
    expect(runs).toBe(2);
    expect(new WatchOwnerAskStore(db).pending().map((a) => a.eventId)).toEqual(["comment-1"]);
  });

  test("no owner Discord id: nothing is queued and the log says the ping could not be sent", async () => {
    const db = memDb();
    markBridgeRunning(db);
    const { result, logs } = await poller({ db, asks: [STUCK], events: [[ev()]], withOwner: false });
    await result.pollOnce();
    expect(new WatchOwnerAskStore(db).pending()).toEqual([]);
    expect(logs).toContain(
      `[watch] stuck ask ${REPO}#7 id=comment-1: the owner's Discord ping could not be sent — no owner Discord id is configured (IDENTITY-3); the run summary comment carries the question (AGENT-16.a)`,
    );
  });

  test("noteWatchRunAsk without a DB says the ping could not be sent and never throws", () => {
    const logs: string[] = [];
    const out = noteWatchRunAsk({
      db: undefined,
      owner: { discordId: OWNER_ID },
      event: ev(),
      ask: STUCK,
      summaryPosted: false,
      now: 1,
      log: (m) => logs.push(m),
    });
    expect(out).toEqual({ kind: "not-sent", why: "no-db" });
    expect(logs[0]).toContain("could not be sent — no shared DB to hand it to the bridge");
  });

  test("the bridge mark: alive only while the process it names runs; a stop clears only its own mark", () => {
    const db = memDb();
    expect(bridgeRunning(db)).toBe(false);
    const me = markBridgeRunning(db);
    expect(me).toBe(scheduleRunnerId());
    expect(bridgeRunning(db)).toBe(true);
    clearBridgeRunning(db, "1:other");
    expect(bridgeRunning(db)).toBe(true);
    clearBridgeRunning(db, me);
    expect(bridgeRunning(db)).toBe(false);
    // A dead process's mark (a crashed bridge) does not count.
    markBridgeRunning(db, "999999999:1");
    expect(bridgeRunning(db)).toBe(false);
    expect(
      (db.query("SELECT value FROM schema_meta WHERE key = ?").get(BRIDGE_RUNNER_META_KEY) as { value: string }).value,
    ).toBe("999999999:1");
  });

  test("the stored question is SAFE-6 scrubbed and the table is a re-scrub target; only stuck asks are stored", () => {
    const db = memDb();
    const store = new WatchOwnerAskStore(db);
    store.record({ event: ev(), ask: { reason: "stuck", question: `token ${FAKE_TOKEN} fails` }, now: 1 });
    expect(store.pending()[0]!.ask.question).toBe("token [redacted:github-token] fails");
    expect(store.record({ event: ev({ number: 8 }), ask: { reason: "clarify", question: "q" }, now: 1 })).toBeNull();
    expect(SCRUB_TARGETS).toContainEqual({ table: "watch_owner_asks", columns: ["question"] });
    db.run("UPDATE watch_owner_asks SET question = ?", [`raw ${FAKE_TOKEN}`]);
    expect(rescrubDatabase(db).byTable.watch_owner_asks).toBe(1);
    expect(store.pending()[0]!.ask.question).toBe("raw [redacted:github-token]");
  });
});

describe("the WATCH spawn client returns the ask from the result frame (REQ-watch-086)", () => {
  test("a blocked result frame's stuck ask comes back re-normalized", async () => {
    const dir = tmp("corvidinho-watch-stuck-bin-");
    const result: TaskResult = {
      summary: formatAskSummary(STUCK),
      filesChanged: [],
      verified: false,
      verifySkipped: true,
      cancelled: false,
      state: "blocked",
      attempts: 1,
      ask: STUCK,
    };
    const bin = join(dir, "corvidinho");
    writeFileSync(bin, `#!/bin/sh\ncat <<'NDJSON_EOF'\n${serializeFrame(resultFrame(result))}\nNDJSON_EOF\n`, { mode: 0o755 });
    chmodSync(bin, 0o755);
    const res = await createSpawnAgentClient({ bin, cwd: dir }).runChat({ prompt: "look", sessionId: "w-1" });
    expect(res.ok).toBe(true);
    expect(res.ask).toEqual(STUCK);
  }, 30_000);
});

describe("Discord bridge: the owner is DMed each stuck WATCH ask (REQ-discord-086)", () => {
  function pendingAsk(db: Database, over: Partial<DetectedEvent> = {}, at = Date.now()): WatchOwnerAsk {
    return new WatchOwnerAskStore(db).record({ event: ev(over), ask: STUCK, now: at })!;
  }

  test("the DM: the stuck-ask post with the GitHub thread first, no mention", () => {
    const db = memDb();
    const text = formatWatchStuckAskDm(pendingAsk(db));
    expect(text).toBe(
      [
        `GitHub ${REPO}#7 — answer on the thread: https://github.com/${REPO}/issues/7#issuecomment-1`,
        "⚠️ I'm stuck and need a human.",
        `> ${STUCK.question}`,
      ].join("\n"),
    );
    expect(text).not.toContain("<@");
  });

  test("delivery DMs the owner once and takes the ask; a failed DM is handed back and retried only after the wait", async () => {
    const db = memDb();
    pendingAsk(db);
    let t = Date.now();
    const dms: Array<{ userId: string; content: string }> = [];
    let fail = true;
    const logs: string[] = [];
    const delivery = createWatchAskDelivery({
      db,
      owner: () => ({ discordId: OWNER_ID }),
      sendDm: () => async (o) => {
        dms.push(o);
        return fail ? null : { channelId: "dm", messageId: `m${dms.length}` };
      },
      now: () => t,
      log: (m) => logs.push(m),
    });
    expect(await delivery.deliver()).toEqual({ sent: 0, failed: 1, expired: 0 });
    expect(new WatchOwnerAskStore(db).pending()).toHaveLength(1);
    fail = false;
    expect(await delivery.deliver()).toEqual({ sent: 0, failed: 0, expired: 0 });
    t += WATCH_ASK_RETRY_MS + 1;
    expect(await delivery.deliver()).toEqual({ sent: 1, failed: 0, expired: 0 });
    expect(dms).toHaveLength(2);
    expect(dms[1]!.userId).toBe(OWNER_ID);
    expect(dms[1]!.content).toContain(STUCK.question);
    expect(new WatchOwnerAskStore(db).pending()).toEqual([]);
    expect(await delivery.deliver()).toEqual({ sent: 0, failed: 0, expired: 0 });
    expect(logs).toContain(`[discord] WATCH stuck ask ${REPO}#7 id=comment-1: owner DMed (AGENT-16.a)`);
  });

  test("no owner, or no live gateway yet: the ask waits; older than a day it is given up, never sent late", async () => {
    const db = memDb();
    const t0 = Date.now();
    pendingAsk(db, {}, t0);
    const dms: string[] = [];
    let owner: { discordId: string } | null = null;
    let t = t0;
    const logs: string[] = [];
    const delivery = createWatchAskDelivery({
      db,
      owner: () => owner,
      sendDm: () => undefined,
      now: () => t,
      log: (m) => logs.push(m),
    });
    await delivery.deliver();
    owner = { discordId: OWNER_ID };
    await delivery.deliver();
    expect(new WatchOwnerAskStore(db).pending()).toHaveLength(1);
    t = t0 + WATCH_OWNER_ASK_TTL_MS + 1;
    expect(await delivery.deliver()).toEqual({ sent: 0, failed: 0, expired: 1 });
    expect(new WatchOwnerAskStore(db).pending()).toEqual([]);
    expect(dms).toEqual([]);
    expect(logs[0]).toContain("gave up after a day");
  });

  test("a stop while the DM is in flight hands the ask back for the next start", async () => {
    const db = memDb();
    pendingAsk(db);
    let started = false;
    const delivery = createWatchAskDelivery({
      db,
      owner: () => ({ discordId: OWNER_ID }),
      sendDm: () => () => {
        started = true;
        return new Promise(() => {});
      },
      log: () => {},
    });
    void delivery.deliver();
    await Bun.sleep(10);
    expect(started).toBe(true);
    expect(new WatchOwnerAskStore(db).pending()).toEqual([]);
    delivery.stop();
    expect(await delivery.settle(20)).toBe(false);
    expect(new WatchOwnerAskStore(db).pending()).toHaveLength(1);
  });

  test("the running bridge marks itself, DMs the owner on its tick, and clears its mark on stop", async () => {
    const db = memDb();
    const dms: Array<{ userId: string; content: string }> = [];
    const idle: DiscordAgent = {
      async runChat({ sessionId }) {
        return { ok: true, sessionId, summary: "done", exitCode: 0 };
      },
    };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(tmp(), "none.toml"),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      },
      db,
      projectRoot: tmp("corvidinho-watch-stuck-proj-"),
      skipProtocolCheck: true,
      thinkingOutbound: memoryThinkingOutbound(),
      agent: idle,
      schedulerPollIntervalMs: 20,
      gatewayFactory: async (_cfg, handlers) => {
        handlers.sendDm = async (o) => {
          dms.push(o);
          return { channelId: "dm-1", messageId: `m${dms.length}` };
        };
        return createNullGateway();
      },
    } as Parameters<typeof startBridge>[0]);
    if (!result.ok) throw new Error("bridge did not start");
    expect(bridgeRunning(db)).toBe(true);
    pendingAsk(db, { id: "assign-9", type: "assignment", number: 9 });
    const end = Date.now() + 3000;
    while (dms.length === 0 && Date.now() < end) await Bun.sleep(20);
    await Bun.sleep(100); // more ticks: still one DM
    await result.stop();
    expect(dms).toHaveLength(1);
    expect(dms[0]!.userId).toBe(OWNER_ID);
    expect(dms[0]!.content).toContain(`GitHub ${REPO}#9`);
    expect(dms[0]!.content).toContain(STUCK.question);
    expect(new WatchOwnerAskStore(db).pending()).toEqual([]);
    expect(bridgeRunning(db)).toBe(false);
  });
});
