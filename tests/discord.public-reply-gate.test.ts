/**
 * AUTONOMY-10 / AUTONOMY-10.a (#97, REQ-discord-099) — its first 20 replies
 * in public threads each wait for the owner's OK on an Approve card, even
 * text the owner dictated and replies to the owner.
 *
 * Covers the gate (src/discord/public-reply-gate.ts): what is a public thread
 * (asked of the gateway at post time; a failed lookup is public), the
 * approved count in `schema_meta` (no schema change), the hold (a fixed hold
 * line, a plain `reply` card with the text verbatim before it, Approve posts
 * exactly what the card showed and counts, Deny / lapse / stop / no owner
 * posts nothing). Then every surface that posts model text: a chat answer, an
 * ask pick's answer, a restated question (thin ack), `/session start`,
 * `/work`, a schedule's result and ask — and the fixed-text posts that never
 * wait (⏹ Stopped, a failed run's DISCORD-3.b line, a spend-cap stop). The
 * per-spawn stamp makes `discord-send-file` ask in such a thread. One case
 * runs the real `task run` against the fake model.
 *
 * Dry-run bridge, fake gateway (`isPublicThread` answered by the test),
 * in-memory SQLite, stub agents and fake bins; the fake model is a
 * localhost server. No network, no token.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalStore, type ApprovalRequest } from "../src/approvals/store.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import {
  createSpawnAgentClient,
  type AgentClient,
  type AgentRunChatOpts,
} from "../src/discord/agent-client.ts";
import { ASK_BUTTON_TTL_MS, pickCustomId } from "../src/discord/ask-buttons.ts";
import { createApprovalCards } from "../src/discord/approval-cards.ts";
import { approveCardCustomId } from "../src/discord/approve-card.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { FAILED_TOLD_OWNER_TEXT } from "../src/discord/failure-reason.ts";
import {
  createNullGateway,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import {
  PUBLIC_REPLIES_APPROVED_KEY,
  PUBLIC_REPLY_HOLD_LINE,
  PUBLIC_REPLY_KIND,
  PUBLIC_REPLY_PROGRESS_TEXT,
  PUBLIC_THREAD_REPLY_LIMIT,
  REPLY_PUBLIC_THREAD_ENV,
  approvedPublicReplies,
  countApprovedPublicReply,
  createPublicReplyGate,
  isPublicThreadType,
  publicReplyApprovalKind,
  publicReplyNotPostedText,
  publicRepliesStillWait,
  setPublicReplyTestHooks,
} from "../src/discord/public-reply-gate.ts";
import { RUN_STOPPED_TEXT, parseStopRunCustomId } from "../src/discord/run-control.ts";
import type { SlashInteraction, SlashReplyPayload } from "../src/discord/slash-types.ts";
import type { AgentSpawnResult, InboundMessage } from "../src/discord/types.ts";
import { mustAskGate } from "../src/plugins/must-ask.ts";
import type { MustAskClassifier } from "../src/plugins/types.ts";
import { discordSendFile } from "../plugins/discord/send-file.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { startFakeLlm, useConfiguredModel } from "./fixtures/fake-llm.ts";
import { teamPeopleFile } from "./fixtures/team-people.ts";

useConfiguredModel();

const ROOT = join(import.meta.dir, "..");
const OWNER_ID = "111122223333444455";
const TEAM_ID = "222233334444555566";
const CHANNEL = "chan-1";
const THREAD = "thread-public";
const PRIVATE_THREAD = "thread-private";
const ANSWER = "Here is the plan: ship the release notes on Friday.";
const FAKE_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD";

type Db = ReturnType<typeof openCorvidinhoDb>;

const restores: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (restores.length > 0) await restores.pop()?.();
});

/** Every card the gate records, decided by the test (or left to lapse). */
function cards(opts: { ttlMs?: number } = {}) {
  const requests: ApprovalRequest[] = [];
  const prev = setPublicReplyTestHooks({
    ttlMs: opts.ttlMs ?? 5_000,
    pollMs: 5,
    onRequest: (req) => void requests.push(req),
  });
  restores.push(() => void setPublicReplyTestHooks(prev));
  return requests;
}

async function until(cond: () => boolean, ms = 5_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(5);
  }
  return cond();
}

function decide(db: Db, req: ApprovalRequest, status: "approved" | "denied"): void {
  expect(new ApprovalStore({ db }).decide(req.id, status, { by: OWNER_ID })).toBe(true);
}

function quiet(): void {
  const log = spyOn(console, "log").mockImplementation(() => {});
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  restores.push(() => {
    log.mockRestore();
    warn.mockRestore();
  });
}

// ─── The gate itself ─────────────────────────────────────────────────────────

describe("public threads and the approved count", () => {
  test("a PublicThread (forum and media posts are public threads) or an AnnouncementThread is public; nothing else is", () => {
    expect(isPublicThreadType(11)).toBe(true); // PublicThread (a forum post too)
    expect(isPublicThreadType(10)).toBe(true); // AnnouncementThread
    for (const t of [0, 2, 4, 5, 12, 13, 15, 16, undefined, null, "11"]) {
      expect(isPublicThreadType(t)).toBe(false);
    }
  });

  test("the count lives in schema_meta (no schema change): 0 at first, +1 per approval, unreadable is 0", () => {
    const db = openCorvidinhoDb({ memory: true });
    expect(approvedPublicReplies(db)).toBe(0);
    expect(publicRepliesStillWait(db)).toBe(true);
    expect(countApprovedPublicReply(db)).toBe(1);
    expect(countApprovedPublicReply(db)).toBe(2);
    const row = db.query("SELECT value FROM schema_meta WHERE key = ?").get(PUBLIC_REPLIES_APPROVED_KEY) as { value: string };
    expect(row.value).toBe("2");
    db.run("UPDATE schema_meta SET value = 'garbage' WHERE key = ?", [PUBLIC_REPLIES_APPROVED_KEY]);
    expect(approvedPublicReplies(db)).toBe(0);
    db.run("UPDATE schema_meta SET value = ? WHERE key = ?", [String(PUBLIC_THREAD_REPLY_LIMIT), PUBLIC_REPLIES_APPROVED_KEY]);
    expect(publicRepliesStillWait(db)).toBe(false);
    db.close();
  });

  test("mustHold asks the gateway at post time; a lookup that fails is public; nothing waits once 20 were approved", async () => {
    quiet();
    const db = openCorvidinhoDb({ memory: true });
    const asked: string[] = [];
    let lookup: ((id: string) => Promise<boolean>) | undefined;
    const gate = createPublicReplyGate({ db, owner: () => ({ discordId: OWNER_ID }), lookup: () => lookup });
    expect(await gate.mustHold(THREAD)).toBe(false); // no gateway that can tell
    lookup = async (id) => {
      asked.push(id);
      if (id === "broken") throw new Error("Missing Access");
      return id === THREAD;
    };
    expect(await gate.mustHold(THREAD)).toBe(true);
    expect(await gate.mustHold(CHANNEL)).toBe(false);
    expect(await gate.mustHold("broken")).toBe(true);
    expect(asked).toEqual([THREAD, CHANNEL, "broken"]);
    db.run("INSERT INTO schema_meta (key, value) VALUES (?, ?)", [PUBLIC_REPLIES_APPROVED_KEY, "20"]);
    expect(await gate.mustHold(THREAD)).toBe(false);
    expect(asked).toHaveLength(3); // no lookup once 20 were approved
    db.close();
  });
});

describe("the hold", () => {
  function noteGate(db: Db, opts: { owner?: boolean } = {}) {
    const posts: Array<{ channelId: string; content: string; replyToMessageId?: string }> = [];
    const edits: Array<{ messageId: string; content?: string | null }> = [];
    const removed: string[] = [];
    const delivered: number[] = [];
    const gate = createPublicReplyGate({
      db,
      owner: () => (opts.owner === false ? null : { discordId: OWNER_ID }),
      lookup: () => async (id) => id === THREAD,
      post: () => async (o) => {
        posts.push(o);
        return { messageId: `note_${posts.length}` };
      },
      edit: () => async (o) => {
        edits.push({ messageId: o.messageId, content: o.content });
        return true;
      },
      remove: () => async (o) => {
        removed.push(o.messageId);
        return true;
      },
      deliver: () => void delivered.push(1),
      log: () => {},
    });
    return { gate, posts, edits, removed, delivered };
  }

  test("not a public thread: posted as it is, no card", async () => {
    const requests = cards();
    const db = openCorvidinhoDb({ memory: true });
    const { gate, posts } = noteGate(db);
    expect(await gate.hold({ channelId: CHANNEL, text: ANSWER, surface: "chat" })).toEqual({
      post: true,
      held: false,
      text: ANSWER,
    });
    expect(requests).toEqual([]);
    expect(posts).toEqual([]);
    db.close();
  });

  test("Approve: a plain `reply` card with the text verbatim, a hold note while it waits, then exactly that text; it counts", async () => {
    const requests = cards();
    const db = openCorvidinhoDb({ memory: true });
    const { gate, posts, removed, delivered } = noteGate(db);
    const pending = gate.hold({ channelId: THREAD, text: ANSWER, requester: TEAM_ID, surface: "chat", replyToMessageId: "m1" });
    expect(await until(() => requests.length === 1 && posts.length === 1)).toBe(true);
    const req = requests[0]!;
    expect(req.kind).toBe(PUBLIC_REPLY_KIND);
    expect(req.class).toBe("plain");
    expect(req.text).toBe(ANSWER);
    expect(req.textLabel).toBe("text");
    expect(req.target).toBe(`Discord thread <#${THREAD}> (${THREAD})`);
    expect(req.amount).toBe(`1 reply (${ANSWER.length} characters)`);
    expect(req.requester).toBe(TEAM_ID);
    expect(req.title).toContain("AUTONOMY-10");
    expect(req.title).toBe(`Public-thread reply (AUTONOMY-10) · 0/${PUBLIC_THREAD_REPLY_LIMIT} approved · from chat`);
    expect(delivered).toHaveLength(1); // the card goes out at once
    expect(posts).toEqual([{ channelId: THREAD, content: PUBLIC_REPLY_HOLD_LINE, replyToMessageId: "m1" }]);
    expect(PUBLIC_REPLY_HOLD_LINE).toContain("waiting for the owner's OK before replying here");
    decide(db, req, "approved");
    expect(await pending).toEqual({ post: true, held: true, text: ANSWER, requestId: req.id });
    expect(removed).toEqual(["note_1"]);
    expect(approvedPublicReplies(db)).toBe(1);
    expect(new ApprovalStore({ db }).get(req.id)!.status).toBe("used");
    db.close();
  });

  test("Deny, no answer in time, a stop and the bridge closing post nothing and do not count (SAFE-20)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    // Deny.
    let requests = cards();
    let n = noteGate(db);
    let pending = n.gate.hold({ channelId: THREAD, text: ANSWER, surface: "chat" });
    expect(await until(() => requests.length === 1)).toBe(true);
    decide(db, requests[0]!, "denied");
    expect(await pending).toEqual({ post: false, outcome: "denied", requestId: requests[0]!.id, noteMessageId: "note_1" });
    expect(n.edits).toEqual([{ messageId: "note_1", content: publicReplyNotPostedText("denied") }]);
    expect(publicReplyNotPostedText("denied")).toBe("Not posted — the owner didn't OK this reply.");
    // No answer in time.
    requests = cards({ ttlMs: 30 });
    n = noteGate(db);
    expect(await n.gate.hold({ channelId: THREAD, text: ANSWER, surface: "chat" })).toMatchObject({
      post: false,
      outcome: "expired",
    });
    expect(n.edits.at(-1)!.content).toBe(publicReplyNotPostedText("expired"));
    expect(new ApprovalStore({ db }).get(requests[0]!.id)!.status).toBe("expired");
    // A stop while it waits.
    requests = cards();
    n = noteGate(db);
    const stop = new AbortController();
    pending = n.gate.hold({ channelId: THREAD, text: ANSWER, surface: "chat", signal: stop.signal });
    expect(await until(() => requests.length === 1)).toBe(true);
    stop.abort();
    expect(await pending).toMatchObject({ post: false, outcome: "stopped" });
    // The bridge closing (even an approval that lands after it is not used).
    requests = cards();
    n = noteGate(db);
    pending = n.gate.hold({ channelId: THREAD, text: ANSWER, surface: "schedule" });
    expect(await until(() => requests.length === 1)).toBe(true);
    n.gate.close();
    expect(await pending).toMatchObject({ post: false, outcome: "stopped" });
    expect(await n.gate.hold({ channelId: THREAD, text: ANSWER, surface: "chat" })).toMatchObject({
      post: false,
      outcome: "stopped",
    });
    expect(approvedPublicReplies(db)).toBe(0);
    db.close();
  });

  test("with no owner configured nothing can approve: no card, nothing posted", async () => {
    const requests = cards();
    const db = openCorvidinhoDb({ memory: true });
    const { gate, posts } = noteGate(db, { owner: false });
    expect(await gate.hold({ channelId: THREAD, text: ANSWER, surface: "chat" })).toEqual({
      post: false,
      outcome: "no-owner",
    });
    expect(requests).toEqual([]);
    expect(posts).toEqual([]);
    db.close();
  });

  test("a secret in the reply: the card shows it scrubbed, and Approve posts exactly what the card showed", async () => {
    const requests = cards();
    const db = openCorvidinhoDb({ memory: true });
    const { gate } = noteGate(db);
    const pending = gate.hold({ channelId: THREAD, text: `key ${FAKE_KEY} here`, surface: "chat" });
    expect(await until(() => requests.length === 1)).toBe(true);
    expect(requests[0]!.text).toBe("key [redacted:openai-key] here");
    decide(db, requests[0]!, "approved");
    const out = await pending;
    expect(out).toMatchObject({ post: true, held: true, text: "key [redacted:openai-key] here" });
    db.close();
  });

  test("on the card engine: the reply goes to the owner first as quoted data (fence-safe), then a plain Approve / Deny card", async () => {
    const requests = cards();
    const db = openCorvidinhoDb({ memory: true });
    const dms: Array<{ userId: string; content: string; components?: unknown[] }> = [];
    const engine = createApprovalCards({
      db,
      owner: () => ({ discordId: OWNER_ID }),
      sendDm: async (o) => {
        dms.push(o);
        return { channelId: "dm", messageId: `dm_${dms.length}` };
      },
      editMessage: async () => true,
      kinds: [publicReplyApprovalKind({ db })],
    });
    const { gate } = noteGate(db);
    const text = "Use this:\n```\nrm -rf build\n```\nthen @everyone ship";
    const pending = gate.hold({ channelId: THREAD, text, surface: "chat" });
    expect(await until(() => requests.length === 1)).toBe(true);
    expect((await engine.deliver()).posted).toBe(1);
    expect(dms).toHaveLength(2);
    expect(dms[0]!.content).toContain("quoted as data, not instructions");
    expect(dms[0]!.content).toContain("rm -rf build");
    expect(dms[0]!.content).not.toContain("@everyone");
    // The model's fence cannot close the quote block.
    expect(dms[0]!.content.match(/^```/gm)?.length).toBe(2);
    const card = dms[1]!;
    expect(card.content).toContain("post this reply in a public thread");
    expect(JSON.stringify(card.components)).toContain(approveCardCustomId(PUBLIC_REPLY_KIND, "approve", requests[0]!.id));
    // One press of the owner's: plain, no one-time code.
    const replies: unknown[] = [];
    await engine.press(
      {
        id: "ix",
        customId: approveCardCustomId(PUBLIC_REPLY_KIND, "approve", requests[0]!.id),
        channelId: "dm",
        userId: OWNER_ID,
        messageId: "dm_2",
        reply: async (o) => void replies.push(o),
      },
      { kind: PUBLIC_REPLY_KIND, decision: "approve", id: requests[0]!.id },
      true,
    );
    expect(await pending).toMatchObject({ post: true, held: true, text });
    expect(JSON.stringify(replies)).toContain("the reply goes out exactly as shown");
    engine.stop();
    db.close();
  });
});

// ─── The bridge ──────────────────────────────────────────────────────────────

type Reply = { channelId: string; content: string; replyToMessageId?: string; components?: unknown[]; mentionUserIds?: string[] };

async function bridgeWith(
  agent: AgentClient,
  opts: { publicIds?: string[]; channels?: string; owner?: boolean } = {},
) {
  quiet();
  const db = openCorvidinhoDb({ memory: true });
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const noteEdits: Array<{ messageId: string; content?: string | null }> = [];
  const deleted: string[] = [];
  const lookups: string[] = [];
  const publicIds = new Set(opts.publicIds ?? [THREAD]);
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: opts.channels ?? CHANNEL,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: teamPeopleFile(TEAM_ID),
      ...(opts.owner === false ? {} : { CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID }),
    },
    db,
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-public-reply-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    approvalPollMs: 0,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        replies.push(o);
        return { messageId: `bot_${replies.length}` };
      };
      handlers.sendDm = async () => ({ channelId: "dm", messageId: "dm_1" });
      handlers.editMessage = async (o) => {
        noteEdits.push({ messageId: o.messageId, content: o.content });
        return true;
      };
      handlers.deleteMessage = async (o) => {
        deleted.push(o.messageId);
        return true;
      };
      handlers.isPublicThread = async (id) => {
        lookups.push(id);
        return publicIds.has(id);
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  restores.push(async () => {
    await result.stop();
    db.close();
  });
  /** Everything that went out in a channel (progress edits, answers, replies). */
  const everything = () => JSON.stringify([outbound.sends, outbound.edits, outbound.contentEdits, outbound.posts, replies]);
  return { result, handlers: box.handlers, outbound, replies, noteEdits, deleted, lookups, db, everything };
}

function inThread(authorId: string, id = "m1", content = "@bot what is the plan?", threadId = THREAD): InboundMessage {
  return {
    id,
    channelId: CHANNEL,
    threadId,
    authorId,
    authorBot: false,
    content,
    mentionedBot: true,
  };
}

function stubAgent(results: Array<Omit<AgentSpawnResult, "sessionId">>, calls: AgentRunChatOpts[] = []): AgentClient {
  let i = 0;
  return {
    async runChat(input) {
      calls.push(input);
      const r = results[Math.min(i, results.length - 1)]!;
      i += 1;
      return { ...r, sessionId: input.sessionId };
    },
  };
}

const done = (summary = ANSWER): Omit<AgentSpawnResult, "sessionId"> => ({
  ok: true,
  summary,
  exitCode: 0,
  task: { state: "done", verified: true, verifySkipped: false, attempts: 1 },
});

const asking = (ask: HumanAsk): Omit<AgentSpawnResult, "sessionId"> => ({
  ok: true,
  summary: "Needs your input",
  exitCode: 0,
  ask,
  task: { state: "blocked", verified: false, verifySkipped: true, attempts: 1 },
});

describe("a chat answer in a public thread (AUTONOMY-10.a)", () => {
  test("even the owner's own answer waits on its progress message; Approve posts exactly the card's text and counts", async () => {
    const requests = cards();
    const e = await bridgeWith(stubAgent([done()]));
    const handled = e.handlers.onMessage(inThread(OWNER_ID));
    expect(await until(() => requests.length === 1)).toBe(true);
    expect(requests[0]!.text).toBe(ANSWER);
    expect(requests[0]!.kind).toBe("reply");
    // Held: the progress message shows the hold line; nothing of the answer is out.
    expect(await until(() => JSON.stringify(e.outbound.edits).includes(PUBLIC_REPLY_HOLD_LINE))).toBe(true);
    expect(e.everything()).not.toContain(ANSWER);
    // The Stop button stays while it waits (no edit cleared it).
    expect(e.outbound.edits.some((x) => x.components === null)).toBe(false);
    decide(e.db, requests[0]!, "approved");
    await handled;
    expect(e.outbound.contentEdits.at(-1)!.content).toBe(ANSWER);
    expect(approvedPublicReplies(e.db)).toBe(1);
  });

  test("Deny: the progress message says it was not posted; no text, no question, no ping; the turn records the line", async () => {
    const requests = cards();
    const e = await bridgeWith(stubAgent([done()]));
    const handled = e.handlers.onMessage(inThread(TEAM_ID));
    expect(await until(() => requests.length === 1)).toBe(true);
    decide(e.db, requests[0]!, "denied");
    await handled;
    const last = e.outbound.contentEdits.at(-1)!;
    expect(last.content).toBe(publicReplyNotPostedText("denied"));
    expect(e.everything()).not.toContain(ANSWER);
    const session = e.result.store.list()[0]!;
    expect(e.result.store.threadPrompt(session, "next")).toContain(publicReplyNotPostedText("denied"));
    expect(e.result.store.threadPrompt(session, "next")).not.toContain(ANSWER);
    expect(approvedPublicReplies(e.db)).toBe(0);
  });

  test("a held clarify question is pending only once it is posted; a denied one never is", async () => {
    const ask: HumanAsk = { reason: "clarify", question: "Postgres or SQLite?" };
    for (const answer of ["approved", "denied"] as const) {
      const requests = cards();
      const e = await bridgeWith(stubAgent([asking(ask)]));
      const handled = e.handlers.onMessage(inThread(TEAM_ID));
      expect(await until(() => requests.length === 1)).toBe(true);
      expect(requests[0]!.text).toContain("Postgres or SQLite?");
      expect(e.result.store.list()[0]!.pendingAsk).toBeUndefined();
      await Bun.sleep(25);
      const decidedAt = Date.now();
      decide(e.db, requests[0]!, answer);
      await handled;
      const pending = e.result.store.list()[0]!.pendingAsk;
      if (answer === "approved") {
        expect(pending?.question).toBe("Postgres or SQLite?");
        expect(e.outbound.contentEdits.at(-1)!.content).toBe(requests[0]!.text);
        // DISCORD-ASK-5: its ~30 minutes run from when it went out, not from
        // before the owner's OK.
        expect(pending!.expiresAt).toBeGreaterThanOrEqual(decidedAt + ASK_BUTTON_TTL_MS);
      } else {
        expect(pending).toBeUndefined();
        expect(e.everything()).not.toContain("Postgres or SQLite?");
      }
      await restores.pop()?.(); // this bridge
    }
  });

  test("a plain channel, a private thread, or 20 already approved: no card, the answer goes out at once", async () => {
    const requests = cards();
    const e = await bridgeWith(stubAgent([done()]));
    await e.handlers.onMessage({ ...inThread(TEAM_ID, "m1"), threadId: undefined });
    await e.handlers.onMessage(inThread(TEAM_ID, "m2", "@bot again", PRIVATE_THREAD));
    expect(e.lookups).toEqual([CHANNEL, CHANNEL, PRIVATE_THREAD, PRIVATE_THREAD]); // spawn stamp + post, each
    e.db.run("INSERT INTO schema_meta (key, value) VALUES (?, ?)", [PUBLIC_REPLIES_APPROVED_KEY, "20"]);
    await e.handlers.onMessage(inThread(TEAM_ID, "m3"));
    expect(e.lookups).toHaveLength(4); // no lookup once 20 were approved
    expect(requests).toEqual([]);
    expect(e.outbound.contentEdits.filter((x) => x.content === ANSWER)).toHaveLength(3);
  });

  test("fixed text never waits: a failed run's line, a spend-cap stop and ⏹ Stopped", async () => {
    const requests = cards();
    const failed: Omit<AgentSpawnResult, "sessionId"> = {
      ok: false,
      summary: "MODEL TEXT",
      exitCode: 1,
      failureReason: "The model call failed (401 Unauthorized from api.openai.com)",
      task: { state: "failed", verified: false, verifySkipped: false, attempts: 1 },
    };
    const spendCap = asking({ reason: "spend-cap", question: "cap $5 reached" });
    const e = await bridgeWith(stubAgent([failed, spendCap]));
    await e.handlers.onMessage(inThread(TEAM_ID, "m1"));
    expect(e.outbound.contentEdits.at(-1)!.content).toBe(FAILED_TOLD_OWNER_TEXT);
    await e.handlers.onMessage(inThread(TEAM_ID, "m2", "@bot another"));
    expect(String(e.outbound.contentEdits.at(-1)!.content)).toContain("Work is paused for budget.");
    expect(requests).toEqual([]);
  });

  test("the Stop button still stops a run whose answer waits: ⏹ Stopped, nothing posted, the card closes as a no", async () => {
    const requests = cards();
    const e = await bridgeWith(stubAgent([done()]));
    const handled = e.handlers.onMessage(inThread(OWNER_ID));
    expect(await until(() => requests.length === 1)).toBe(true);
    const progress = e.outbound.sends[0]!;
    const runId = parseStopRunCustomId(/cvstop:[A-Za-z0-9_-]+/.exec(JSON.stringify(progress.components))![0])!;
    const acks: unknown[] = [];
    await e.handlers.onComponent!({
      id: "ix-stop",
      customId: `cvstop:${runId}`,
      channelId: THREAD,
      userId: OWNER_ID,
      messageId: progress.messageId,
      reply: async (o) => void acks.push(o),
    } as ComponentInteraction);
    await handled;
    expect(e.outbound.contentEdits.at(-1)!.content).toBe(RUN_STOPPED_TEXT);
    expect(e.everything()).not.toContain(ANSWER);
    expect(new ApprovalStore({ db: e.db }).get(requests[0]!.id)!.status).toBe("expired");
  });

  test("the run is stamped so discord-send-file asks there too, while replies still wait", async () => {
    cards();
    const calls: AgentRunChatOpts[] = [];
    const e = await bridgeWith(stubAgent([asking({ reason: "clarify", question: "Which?" })], calls));
    await e.handlers.onMessage({ ...inThread(TEAM_ID, "m1"), threadId: undefined });
    expect(calls[0]!.replyPublicThread).toBe(false);
    e.db.run("INSERT INTO schema_meta (key, value) VALUES (?, ?)", [PUBLIC_REPLIES_APPROVED_KEY, "19"]);
    const requests = cards();
    const handled = e.handlers.onMessage(inThread(TEAM_ID, "m2"));
    expect(await until(() => requests.length === 1)).toBe(true);
    expect(calls[1]!.replyPublicThread).toBe(true);
    decide(e.db, requests[0]!, "approved");
    await handled;
    // That approval was the 20th: the next run in the thread is not stamped and nothing waits.
    await e.handlers.onMessage(inThread(TEAM_ID, "m3", "@bot more"));
    expect(calls[2]!.replyPublicThread).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

describe("a restated question and an ask pick in a public thread", () => {
  test("a thin ack restates the open question only after the owner's OK; a note holds its place", async () => {
    const requests = cards();
    const e = await bridgeWith(stubAgent([asking({ reason: "clarify", question: "Postgres or SQLite?" })]));
    const first = e.handlers.onMessage(inThread(TEAM_ID, "m1"));
    expect(await until(() => requests.length === 1)).toBe(true);
    decide(e.db, requests[0]!, "approved");
    await first;
    const askPost = e.outbound.contentEdits.at(-1)!;
    // (The collapsed question's requester ping went out as its own post.)
    const before = e.replies.length;
    // A thin reply to the question restates it: model text, so it waits.
    const thin = e.handlers.onMessage({ ...inThread(TEAM_ID, "m2", "ok"), mentionedBot: false, referencedMessageId: askPost.messageId });
    expect(await until(() => requests.length === 2)).toBe(true);
    expect(requests[1]!.text).toContain("Postgres or SQLite?");
    expect(e.replies.slice(before).map((r) => r.content)).toEqual([PUBLIC_REPLY_HOLD_LINE]);
    decide(e.db, requests[1]!, "approved");
    await thin;
    expect(e.replies.at(-1)!.content).toBe(requests[1]!.text!);
    expect(e.replies.at(-1)!.components).toBeDefined(); // the Answer button rides it
    expect(e.deleted).toEqual([`bot_${before + 1}`]); // the hold note is gone
  });

  test("a denied restatement leaves the note as the not-posted line", async () => {
    const requests = cards();
    const e = await bridgeWith(stubAgent([asking({ reason: "clarify", question: "Postgres or SQLite?" })]));
    const first = e.handlers.onMessage(inThread(TEAM_ID, "m1"));
    expect(await until(() => requests.length === 1)).toBe(true);
    decide(e.db, requests[0]!, "approved");
    await first;
    const askPost = e.outbound.contentEdits.at(-1)!;
    const before = e.replies.length;
    const thin = e.handlers.onMessage({ ...inThread(TEAM_ID, "m2", "ok"), mentionedBot: false, referencedMessageId: askPost.messageId });
    expect(await until(() => requests.length === 2)).toBe(true);
    decide(e.db, requests[1]!, "denied");
    await thin;
    expect(e.replies.slice(before).map((r) => r.content)).toEqual([PUBLIC_REPLY_HOLD_LINE]);
    expect(e.noteEdits.at(-1)).toEqual({ messageId: `bot_${before + 1}`, content: publicReplyNotPostedText("denied") });
    expect(e.everything().split("Postgres or SQLite?").length).toBe(2); // the first, approved post only
  });

  test("an ask pick's answer waits on the stub like a chat answer", async () => {
    const requests = cards();
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Which DB?",
      options: [
        { id: "1", label: "Postgres" },
        { id: "2", label: "SQLite" },
      ],
    };
    const e = await bridgeWith(stubAgent([asking(ask), done("Picked Postgres; done.")]));
    const first = e.handlers.onMessage(inThread(TEAM_ID, "m1"));
    expect(await until(() => requests.length === 1)).toBe(true);
    decide(e.db, requests[0]!, "approved");
    await first;
    const pending = e.result.store.list()[0]!.pendingAsk!;
    expect(pending.stubMessageId).toBeDefined();
    const pick = e.handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(pending.askId, "1"),
      channelId: THREAD,
      userId: TEAM_ID,
      messageId: pending.stubMessageId!,
      reply: async () => {},
      deleteReply: async () => {},
    });
    expect(await until(() => requests.length === 2)).toBe(true);
    expect(requests[1]!.text).toBe("Picked Postgres; done.");
    expect(e.everything()).not.toContain("Picked Postgres; done.");
    decide(e.db, requests[1]!, "approved");
    await pick;
    expect(e.outbound.contentEdits.at(-1)!.content).toBe("Picked Postgres; done.");
    expect(approvedPublicReplies(e.db)).toBe(2);
  });
});

function slash(commandName: "work" | "session", userId: string, channelId = THREAD) {
  const edits: SlashReplyPayload[] = [];
  const ix: SlashInteraction = {
    id: `ix_${commandName}_${Math.random()}`,
    commandName,
    ...(commandName === "session" ? { subcommand: "start" } : {}),
    channelId,
    userId,
    options: commandName === "session" ? { topic: "plan the release" } : { description: "plan the release" },
    reply: async (p) => void edits.push(p),
    deferReply: async () => {},
    editReply: async (p) => void edits.push(p),
    deleteReply: async () => {},
  };
  return { ix, edits };
}

describe("/session start and /work in a public thread", () => {
  test("the answer (the topic I typed included) waits; Deny posts only the not-posted line and leaves no pending question", async () => {
    for (const command of ["session", "work"] as const) {
      const requests = cards();
      const e = await bridgeWith(stubAgent([asking({ reason: "clarify", question: "Which branch?" })]), {
        channels: `${CHANNEL},${THREAD}`,
      });
      const { ix } = slash(command, OWNER_ID);
      const handled = e.handlers.onSlash!(ix);
      expect(await until(() => requests.length === 1)).toBe(true);
      expect(requests[0]!.text).toContain("plan the release");
      expect(requests[0]!.text).toContain("Which branch?");
      expect(e.result.store.list()[0]!.pendingAsk).toBeUndefined();
      decide(e.db, requests[0]!, "denied");
      await handled;
      expect(e.outbound.contentEdits.at(-1)!.content).toBe(publicReplyNotPostedText("denied"));
      expect(e.everything()).not.toContain("Which branch?");
      // The typed topic or description waits on the card too: the progress
      // message never echoed it (REQ-discord-099).
      expect(e.everything()).not.toContain("plan the release");
      expect(JSON.stringify(e.outbound.sends)).toContain(PUBLIC_REPLY_PROGRESS_TEXT);
      expect(e.result.store.list()[0]?.pendingAsk).toBeUndefined();
      await restores.pop()?.();
    }
  });

  test("Approve posts exactly the card's text, and the question is pending once it is out", async () => {
    for (const command of ["session", "work"] as const) {
      const requests = cards();
      const e = await bridgeWith(stubAgent([asking({ reason: "clarify", question: "Which branch?" })]), {
        channels: `${CHANNEL},${THREAD}`,
      });
      const { ix } = slash(command, TEAM_ID);
      const handled = e.handlers.onSlash!(ix);
      expect(await until(() => requests.length === 1)).toBe(true);
      await Bun.sleep(25);
      const decidedAt = Date.now();
      decide(e.db, requests[0]!, "approved");
      await handled;
      expect(e.outbound.contentEdits.at(-1)!.content).toBe(requests[0]!.text);
      expect(e.result.store.list()[0]!.pendingAsk?.question).toBe("Which branch?");
      // DISCORD-ASK-5: counted from when it went out.
      expect(e.result.store.list()[0]!.pendingAsk!.expiresAt).toBeGreaterThanOrEqual(decidedAt + ASK_BUTTON_TTL_MS);
      await restores.pop()?.();
    }
  });

  test("outside a public thread nothing waits", async () => {
    const requests = cards();
    const e = await bridgeWith(stubAgent([done()]));
    await e.handlers.onSlash!(slash("session", TEAM_ID, CHANNEL).ix);
    expect(requests).toEqual([]);
    expect(String(e.outbound.contentEdits.at(-1)!.content)).toContain(ANSWER);
    // Elsewhere the progress message still names the topic.
    expect(JSON.stringify(e.outbound.sends)).toContain("Session: plan the release");
  });
});

describe("a schedule's posts", () => {
  function allow(channels: string[]) {
    const cfg = emptyConfig();
    cfg.discord.channels = channels;
    return cfg;
  }

  test("the result and the question are marked as model text; the ❌ line, a spend-cap stop and the wait note are not", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const posts: Array<{ content: string; modelText?: boolean }> = [];
    const results = [done("Digest: 3 PRs merged."), { ...done(), ok: false, exitCode: 1, summary: "x" }, asking({ reason: "clarify", question: "Which repo?" })];
    let i = 0;
    const agent: AgentClient = {
      async runChat({ sessionId }) {
        return { ...results[Math.min(i++, results.length - 1)]!, sessionId };
      },
    };
    const s = store.create({
      name: "digest",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: OWNER_ID,
      channelId: THREAD,
    });
    let now = Date.now();
    const svc = new SchedulerService({
      store,
      agent,
      allowlist: allow([THREAD]),
      manual: true,
      useWorktrees: false,
      owner: { discordId: OWNER_ID },
      now: () => now,
      outbound: { post: async (p) => void posts.push(p) },
    });
    for (let n = 0; n < 3; n++) {
      db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [now - 1000, s.id]);
      expect((await svc.tick()).started).toEqual([s.id]);
      for (let k = 0; k < 200 && svc.runningIds().length > 0; k++) await Bun.sleep(5);
      await svc.settleAskDelivery();
      now += 60 * 60 * 1000;
    }
    expect(posts[0]!.content).toContain("Digest: 3 PRs merged.");
    expect(posts[0]!.modelText).toBe(true);
    expect(posts[1]!.content).toContain("❌");
    expect(posts[1]!.modelText).toBeUndefined();
    expect(posts[2]!.content).toContain("Which repo?");
    expect(posts[2]!.modelText).toBe(true);
    db.close();
  });

  test("on the bridge, a schedule's result in a public thread waits for the owner's OK; a denied one is not posted or retried", async () => {
    quiet();
    const requests = cards();
    const db = openCorvidinhoDb({ memory: true });
    const store = new ScheduleStore({ db });
    const s = store.create({
      name: "digest",
      cronExpression: "0 * * * *",
      project: ".",
      prompt: "summarize",
      createdByUserId: OWNER_ID,
      channelId: THREAD,
    });
    const replies: string[] = [];
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: `${CHANNEL},${THREAD}`,
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: teamPeopleFile(TEAM_ID),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
      },
      db,
      scheduleStore: store,
      projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-public-reply-sched-")),
      skipProtocolCheck: true,
      schedulerPollIntervalMs: 20,
      approvalPollMs: 0,
      thinkingOutbound: memoryThinkingOutbound(),
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: stubAgent([done("Digest: 3 PRs merged."), done("Digest: 5 PRs merged.")]),
      gatewayFactory: async (_cfg, handlers) => {
        handlers.reply = async ({ content }) => {
          replies.push(content);
          return { messageId: `bot_${replies.length}` };
        };
        handlers.editMessage = async () => true;
        handlers.deleteMessage = async () => true;
        handlers.isPublicThread = async (id) => id === THREAD;
        return createNullGateway();
      },
    });
    if (!result.ok) throw new Error("bridge did not start");
    restores.push(async () => {
      await result.stop();
      db.close();
    });
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    expect(await until(() => requests.length === 1)).toBe(true);
    expect(requests[0]!.text).toContain("Digest: 3 PRs merged.");
    expect(replies).toEqual([PUBLIC_REPLY_HOLD_LINE]);
    decide(db, requests[0]!, "denied");
    db.run("UPDATE schedules SET next_run_at = ? WHERE id = ?", [Date.now() - 1000, s.id]);
    expect(await until(() => requests.length === 2)).toBe(true);
    expect(requests[1]!.text).toContain("Digest: 5 PRs merged.");
    decide(db, requests[1]!, "approved");
    expect(await until(() => replies.some((r) => r.includes("Digest: 5 PRs merged.")))).toBe(true);
    expect(replies.join("\n")).not.toContain("Digest: 3 PRs merged.");
  }, 30_000);
});

describe("discord-send-file in a public thread (the per-spawn stamp)", () => {
  function sendFileEnv(dir: string, stamp: string): NodeJS.ProcessEnv {
    const file = join(dir, "allowlist.toml");
    writeFileSync(file, `[discord]\nchannels = ["${CHANNEL}"]\n`);
    return {
      CORVIDINHO_DATA_DIR: join(dir, "data"),
      CORVIDINHO_ALLOWLIST_FILE: file,
      CORVIDINHO_DISCORD_REPLY_CHANNEL_ID: THREAD,
      CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID: CHANNEL,
      CORVIDINHO_ACTING_DISCORD_USER_ID: TEAM_ID,
      [REPLY_PUBLIC_THREAD_ENV]: stamp,
    };
  }

  test("with the stamp it asks on a plain channel-post card showing the caption and the file; without it, or past 20, it does not", async () => {
    expect(typeof discordSendFile.mustAsk).toBe("function");
    const classify = discordSendFile.mustAsk as MustAskClassifier;
    const sendFileMustAsk = (c: { args: string[]; env: NodeJS.ProcessEnv }) => classify({ ...c, cwd: tmpdir() });
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-send-file-public-"));
    const args = ["chart.png", "--caption", "Here is the chart"];
    expect(await sendFileMustAsk({ args, env: sendFileEnv(dir, "") })).toBeNull();
    expect(await sendFileMustAsk({ args, env: { ...sendFileEnv(dir, "1"), CORVIDINHO_DISCORD_DRY_RUN: "1" } })).toBeNull();
    // A call the handler refuses anyway raises no card.
    expect(await sendFileMustAsk({ args: ["--channel", "x"], env: sendFileEnv(dir, "1") })).toBeNull();
    expect(await sendFileMustAsk({ args, env: { ...sendFileEnv(dir, "1"), CORVIDINHO_ACTING_DISCORD_USER_ID: "" } })).toBeNull();
    const verdict = await sendFileMustAsk({ args, env: sendFileEnv(dir, "1") });
    expect(verdict).toEqual({
      ask: {
        class: "public",
        why: `attaches a file to its reply in a public thread (its first ${PUBLIC_THREAD_REPLY_LIMIT} public-thread replies wait for the owner's OK)`,
        target: `Discord thread ${THREAD}`,
        text: "Here is the chart\n[attachment: chart.png]",
      },
    });
    const db = openCorvidinhoDb({ env: sendFileEnv(dir, "1") });
    db.run("INSERT INTO schema_meta (key, value) VALUES (?, ?)", [PUBLIC_REPLIES_APPROVED_KEY, "20"]);
    db.close();
    expect(await sendFileMustAsk({ args, env: sendFileEnv(dir, "1") })).toBeNull();
  });

  test("through runPlugin's must-ask gate: a denied card attaches nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-send-file-gate-"));
    const env = { ...sendFileEnv(dir, "1"), CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID };
    const { answerMustAsk } = await import("./fixtures/must-ask.ts");
    const answered = answerMustAsk("denied");
    restores.push(() => answered.restore());
    const out = await mustAskGate({ cmd: discordSendFile, args: ["--git-diff"], cwd: dir, env });
    expect(out?.ok).toBe(false);
    expect(out?.error).toContain("AUTONOMY-10");
    expect(answered.requests.map((r) => r.kind)).toEqual(["mustask-post"]);
    expect(answered.requests[0]!.text).toEqual("[attachment: changes.diff (the worktree diff)]");
  });

  test("the spawn client always writes the stamp: 1 for a waiting public thread, else empty (never inherited)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-stamp-"));
    const bin = join(dir, "fake-cli.ts");
    writeFileSync(bin, `console.log("stamp=[" + (process.env.${REPLY_PUBLIC_THREAD_ENV} ?? "unset") + "]");\n`);
    const prev = process.env[REPLY_PUBLIC_THREAD_ENV];
    process.env[REPLY_PUBLIC_THREAD_ENV] = "1"; // a stale stamp in the bridge env
    restores.push(() => {
      if (prev === undefined) delete process.env[REPLY_PUBLIC_THREAD_ENV];
      else process.env[REPLY_PUBLIC_THREAD_ENV] = prev;
    });
    const client = createSpawnAgentClient({ bin, cwd: dir });
    expect((await client.runChat({ prompt: "hi", sessionId: "s1", replyPublicThread: true })).summary).toContain("stamp=[1]");
    expect((await client.runChat({ prompt: "hi", sessionId: "s1" })).summary).toContain("stamp=[]");
  });
});

describe("end to end with the fake model", () => {
  test("a real `task run` answer in a public thread waits for the owner's OK, then goes out exactly", async () => {
    const requests = cards();
    const llm = startFakeLlm({ reply: () => ANSWER });
    restores.push(llm.stop);
    const agent = createSpawnAgentClient({
      bin: join(ROOT, "src/cli.ts"),
      cwd: mkdtempSync(join(tmpdir(), "corvidinho-public-reply-e2e-")),
      env: llm.env,
    });
    const e = await bridgeWith(agent);
    const handled = e.handlers.onMessage(inThread(OWNER_ID));
    expect(await until(() => requests.length === 1, 30_000)).toBe(true);
    expect(requests[0]!.text).toBe(ANSWER);
    expect(e.everything()).not.toContain(ANSWER);
    decide(e.db, requests[0]!, "approved");
    await handled;
    expect(e.outbound.contentEdits.at(-1)!.content).toBe(ANSWER);
    expect(approvedPublicReplies(e.db)).toBe(1);
  }, 60_000);
});
