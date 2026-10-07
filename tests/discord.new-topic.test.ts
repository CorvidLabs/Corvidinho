/**
 * SESSION-3.b (REQ-discord-479): "Only /session start or my saying 'new topic'
 * starts a fresh session; a normal @mention keeps continuing the open one."
 *
 * A message whose text (after the bot mention) begins with 'new topic' — any
 * case, then an optional `:` / `-` / `,` and the request — parks the author's
 * open session the way idle expiry does (its conversation kept for a later
 * reply, SESSION-3.a) and starts a fresh session with the request as its first
 * message; with nothing after the phrase it posts one fixed ack and the fresh
 * session takes the next message. The phrase anywhere else, and every other
 * message, continues the open session as before. Every gate still runs first,
 * and a 'new topic' sent while a run is going waits for it (AGENT-3.a).
 *
 * Pure router units plus a dry-run bridge with a fake gateway, the in-memory
 * outbound and stub agents (the configured model comes from the fake LLM
 * fixture; no model is called), an in-memory SQLite DB and temp non-git
 * projects; no network.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { routeMessage, stripMentions } from "../src/discord/message-router.ts";
import { NEW_TOPIC_ACK, newTopicRequest } from "../src/discord/new-topic.ts";
import { RUN_STOP_ACK, SessionRunControl } from "../src/discord/run-control.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { InboundMessage, RouteAction, SessionStub } from "../src/discord/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";

// The footer names the configured model; there is no built-in default
// (AGENT-13), so this file configures one (the stub agents call no model).
useConfiguredModel();

const CHAN = "chan-1";
const THREAD = "thread-7";
const BOT = "999000000000000999";
const OWNER = "100000000000000001";
const MEMBER = "100000000000000002";
const OTHER = "100000000000000003";
const TTL_MS = 45 * 60 * 1000;

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function mention(id: string, authorId: string, text: string, threadId?: string): InboundMessage {
  return {
    id,
    channelId: CHAN,
    ...(threadId ? { threadId } : {}),
    authorId,
    authorBot: false,
    content: `<@${BOT}> ${text}`,
    mentionedBot: true,
  };
}

function plain(id: string, authorId: string, text: string, threadId?: string): InboundMessage {
  return { ...mention(id, authorId, text, threadId), content: text, mentionedBot: false };
}

function replyTo(id: string, authorId: string, text: string, ref: string): InboundMessage {
  return { ...plain(id, authorId, text), referencedMessageId: ref };
}

/** The request as the run sees it: the mention trailer stripMentions adds. */
const withTrailer = (text: string) => `${text}\n[mentioned: Discord user id ${BOT}]`;

type Gate = { input: AgentRunChatOpts; finish: (summary?: string) => void; aborted: boolean };

/**
 * A stub agent. `gated`: every run waits until the test finishes it (or its
 * signal aborts it, like a killed process); otherwise each run answers at
 * once with `answer: <its human text>`.
 */
function stubAgent(gated = false) {
  const runs: Gate[] = [];
  const agent: AgentClient = {
    runChat(input) {
      return new Promise((resolve) => {
        const gate: Gate = {
          input,
          aborted: false,
          finish: (summary?: string) =>
            resolve({
              ok: true,
              sessionId: input.sessionId,
              summary: summary ?? `answer: ${input.humanText}`,
              exitCode: 0,
            }),
        };
        input.signal?.addEventListener(
          "abort",
          () => {
            gate.aborted = true;
            resolve({ ok: false, sessionId: input.sessionId, summary: "", exitCode: 137 });
          },
          { once: true },
        );
        runs.push(gate);
        if (!gated) gate.finish();
      });
    },
  };
  return { agent, runs };
}

async function bridgeWith(agent: AgentClient, opts: { now?: () => number } = {}) {
  const db = openCorvidinhoDb({ memory: true });
  cleanups.push(() => db.close());
  const projectRoot = tempDir("corvidinho-newtopic-proj-");
  const store = new SessionStore({
    db,
    ttlMs: TTL_MS,
    defaultProjectRoot: projectRoot,
    ...(opts.now ? { now: opts.now } : {}),
  });
  const outbound = memoryThinkingOutbound();
  const replies: Array<{ channelId: string; content: string; replyToMessageId?: string }> = [];
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-newtopic-"), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    },
    projectRoot,
    skipProtocolCheck: true,
    disableScheduler: true,
    approvalPollMs: 0,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    db,
    sessionStore: store,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (o) => {
        replies.push(o);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
  cleanups.push(() => result.stop());
  return { result, handlers: box.handlers, outbound, replies, store };
}

function run(runs: Gate[], i: number): AgentRunChatOpts {
  const r = runs[i];
  if (!r) throw new Error(`no agent run #${i}`);
  return r.input;
}

function answerId(outbound: ReturnType<typeof memoryThinkingOutbound>, i: number): string {
  const send = outbound.sends[i];
  if (!send) throw new Error(`no progress message #${i}`);
  return send.messageId;
}

async function until(cond: () => boolean, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await Bun.sleep(5);
  }
  return cond();
}

/** Let queued promise callbacks and short awaits run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Bun.sleep(1);
}

describe("only 'new topic' at the start counts (SESSION-3.b, newTopicRequest)", () => {
  test("the phrase, any case, then an optional ':' / '-' / ',' and the request", () => {
    expect(newTopicRequest("new topic: draft the notes")).toBe("draft the notes");
    expect(newTopicRequest("New Topic - draft the notes")).toBe("draft the notes");
    expect(newTopicRequest("NEW TOPIC, draft the notes")).toBe("draft the notes");
    expect(newTopicRequest("new topic draft the notes")).toBe("draft the notes");
    expect(newTopicRequest("new topic:draft the notes")).toBe("draft the notes");
    expect(newTopicRequest("new topic — draft the notes")).toBe("draft the notes");
    // The bot mention is gone (stripMentions); its trailer stays with the request.
    expect(newTopicRequest(stripMentions(`<@${BOT}> new topic: hi <@${OTHER}>`))).toBe(
      `hi\n[mentioned: Discord user id ${BOT}, Discord user id ${OTHER}]`,
    );
  });

  test("nothing after the phrase is an empty request", () => {
    for (const text of ["new topic", "New topic.", "new topic!", "new topic:", "new topic -", "  new topic  "]) {
      expect(newTopicRequest(text)).toBe("");
    }
    expect(newTopicRequest(stripMentions(`<@${BOT}> new topic`))).toBe("");
  });

  test("the phrase anywhere else, or another word, is not one", () => {
    for (const text of [
      "tell me about the new topic",
      "what's the new topic?",
      "a new topic: X",
      "new topics to cover",
      "new topic's scope is wide",
      "renew topic",
      "newtopic: X",
      "new",
      "",
    ]) {
      expect(newTopicRequest(text)).toBeNull();
    }
  });
});

describe("SessionRunControl.waitingBehind (SESSION-3.b)", () => {
  test("true only while a later turn of the same session is queued behind the turn", async () => {
    const rc = new SessionRunControl();
    const first = rc.enqueue({ sessionId: "s1", requesterId: OWNER, channelId: CHAN });
    expect(rc.waitingBehind(first.runId)).toBe(false);
    const elsewhere = rc.enqueue({ sessionId: "s2", requesterId: OWNER, channelId: CHAN });
    expect(rc.waitingBehind(first.runId)).toBe(false);
    const second = rc.enqueue({ sessionId: "s1", requesterId: OWNER, channelId: CHAN });
    expect(rc.waitingBehind(first.runId)).toBe(true);
    expect(rc.waitingBehind(second.runId)).toBe(false);
    first.done();
    expect(await second.ready).toBe(true);
    expect(rc.waitingBehind(second.runId)).toBe(false);
    expect(rc.waitingBehind(first.runId)).toBe(false);
    second.done();
    elsewhere.done();
  });
});

describe("routeMessage: 'new topic' where the open session would continue (SESSION-3.b)", () => {
  function deps(store = new SessionStore({ ttlMs: 45 * 60 * 1000 })) {
    const allowlist = emptyConfig();
    allowlist.discord.channels.push(CHAN);
    return { store, allowlist };
  }
  function sessionOf(action: RouteAction): SessionStub {
    if (action.kind !== "start_session" && action.kind !== "continue_session") {
      throw new Error(`expected a session route, got ${action.kind}`);
    }
    return action.session;
  }

  test("a normal @mention continues the open session; 'new topic' routes new_topic with a fresh one", () => {
    const d = deps();
    const a = sessionOf(routeMessage(mention("m1", OWNER, "hello"), d));
    expect(sessionOf(routeMessage(mention("m2", OWNER, "more"), d)).id).toBe(a.id);
    expect(sessionOf(routeMessage(mention("m3", OWNER, "tell me about the new topic"), d)).id).toBe(a.id);

    const fresh = routeMessage(mention("m4", OWNER, "new topic: draft the notes"), d);
    if (fresh.kind !== "new_topic") throw new Error(`expected new_topic, got ${fresh.kind}`);
    expect(fresh.open?.id).toBe(a.id);
    expect(fresh.session.id).not.toBe(a.id);
    expect(fresh.prompt).toBe(withTrailer("draft the notes"));
    // The fresh session is the author's there at once: their next message finds it.
    expect(sessionOf(routeMessage(mention("m5", OWNER, "and then?"), d)).id).toBe(fresh.session.id);
  });

  test("with nothing open, 'new topic' still starts fresh (no open session); others are untouched", () => {
    const d = deps();
    const a = sessionOf(routeMessage(mention("m1", OWNER, "hello"), d));
    const theirs = routeMessage(mention("m2", MEMBER, "New topic"), d);
    if (theirs.kind !== "new_topic") throw new Error(`expected new_topic, got ${theirs.kind}`);
    expect(theirs.open).toBeUndefined();
    expect(theirs.prompt).toBe("");
    expect(theirs.session.userId).toBe(MEMBER);
    expect(sessionOf(routeMessage(mention("m3", OWNER, "still mine"), d)).id).toBe(a.id);
  });

  test("a thread message and a reply to an answer count too; a plain channel message without a mention does not", () => {
    const d = deps();
    const t = sessionOf(routeMessage(mention("m1", OWNER, "in the thread", THREAD), d));
    const inThread = routeMessage(plain("m2", OWNER, "new topic - X", THREAD), d);
    expect(inThread.kind).toBe("new_topic");
    if (inThread.kind === "new_topic") expect(inThread.open?.id).toBe(t.id);

    const c = sessionOf(routeMessage(mention("m3", OWNER, "in the channel"), d));
    d.store.trackBotMessage("answer-1", c);
    const reply = routeMessage(replyTo("m4", OWNER, "new topic, Y", "answer-1"), d);
    expect(reply.kind).toBe("new_topic");
    if (reply.kind === "new_topic") expect(reply.open?.id).toBe(c.id);

    expect(routeMessage(plain("m5", OWNER, "new topic: Z"), d)).toEqual({ kind: "ignore", reason: "no_mention" });
  });
});

describe("through the bridge (SESSION-3.b, REQ-discord-479)", () => {
  test("'new topic: X' starts a new session id; a plain mention and the phrase mid-text continue it", async () => {
    const { agent, runs } = stubAgent();
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(mention("m1", OWNER, "the codeword is PELICAN"));
    await b.handlers.onMessage(mention("m2", OWNER, "and what else?"));
    const a = run(runs, 0).sessionId;
    // A normal @mention keeps continuing the open session.
    expect(run(runs, 1)).toMatchObject({ sessionId: a, resume: true });
    expect(run(runs, 1).prompt).toContain("PELICAN");

    await b.handlers.onMessage(mention("m3", OWNER, "new topic: draft the release notes"));
    expect(runs).toHaveLength(3);
    const fresh = run(runs, 2);
    expect(fresh.sessionId).not.toBe(a);
    expect(fresh.resume).toBe(false);
    expect(fresh.humanText).toBe(withTrailer("draft the release notes"));
    // Fresh: nothing of the open session is replayed, and the phrase is not the request.
    expect(fresh.prompt).not.toContain("PELICAN");
    expect(fresh.prompt).not.toContain("and what else?");
    expect(fresh.prompt).not.toMatch(/new topic/i);
    // The open session was parked (as idle expiry parks it).
    expect(b.store.get(a)).toBeUndefined();

    // The phrase not at the start, and a plain mention, continue the fresh session.
    await b.handlers.onMessage(mention("m4", OWNER, "tell me about the new topic"));
    await b.handlers.onMessage(mention("m5", OWNER, "thanks"));
    expect(run(runs, 3)).toMatchObject({ sessionId: fresh.sessionId, resume: true });
    expect(run(runs, 3).humanText).toBe(withTrailer("tell me about the new topic"));
    expect(run(runs, 3).prompt).toContain("draft the release notes");
    expect(run(runs, 4).sessionId).toBe(fresh.sessionId);
    expect(b.replies).toHaveLength(0);
  });

  test("the parked conversation is kept: a reply to one of its answers starts from it (SESSION-3.a)", async () => {
    const { agent, runs } = stubAgent();
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(mention("m1", OWNER, "the codeword is PELICAN"));
    const oldAnswer = answerId(b.outbound, 0);
    await b.handlers.onMessage(mention("m2", OWNER, "New Topic - list the open PRs"));
    expect(run(runs, 1).prompt).not.toContain("PELICAN");

    await b.handlers.onMessage(replyTo("m3", OWNER, "what was the codeword?", oldAnswer));
    const resumed = run(runs, 2);
    expect(resumed.sessionId).not.toBe(run(runs, 0).sessionId);
    expect(resumed.sessionId).not.toBe(run(runs, 1).sessionId);
    expect(resumed.prompt).toContain("PELICAN");
    expect(resumed.prompt).not.toContain("list the open PRs");
  });

  test("in a thread, 'new topic' without a mention starts fresh there and the next message continues it", async () => {
    const { agent, runs } = stubAgent();
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(mention("m1", OWNER, "the codeword is PELICAN", THREAD));
    await b.handlers.onMessage(plain("m2", OWNER, "NEW TOPIC, check the CI", THREAD));
    const fresh = run(runs, 1);
    expect(fresh.sessionId).not.toBe(run(runs, 0).sessionId);
    expect(fresh).toMatchObject({ resume: false, humanText: "check the CI" });
    expect(fresh.prompt).not.toContain("PELICAN");
    await b.handlers.onMessage(plain("m3", OWNER, "and the release?", THREAD));
    expect(run(runs, 2)).toMatchObject({ sessionId: fresh.sessionId, resume: true });
    expect(run(runs, 2).prompt).toContain("check the CI");
    expect(run(runs, 2).prompt).not.toContain("PELICAN");
  });

  test("a reply to its answer that begins with 'new topic' starts fresh; another reply continues", async () => {
    const { agent, runs } = stubAgent();
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(mention("m1", OWNER, "the codeword is PELICAN"));
    await b.handlers.onMessage(replyTo("m2", OWNER, "and more", answerId(b.outbound, 0)));
    expect(run(runs, 1).sessionId).toBe(run(runs, 0).sessionId);
    await b.handlers.onMessage(replyTo("m3", OWNER, "new topic: summarise issue 12", answerId(b.outbound, 1)));
    expect(run(runs, 2).sessionId).not.toBe(run(runs, 0).sessionId);
    expect(run(runs, 2)).toMatchObject({ resume: false, humanText: "summarise issue 12" });
    expect(run(runs, 2).prompt).not.toContain("PELICAN");
  });

  test("'new topic' alone: one fixed ack, no run; the next message starts the fresh session", async () => {
    const { agent, runs } = stubAgent();
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(mention("m1", OWNER, "the codeword is PELICAN"));
    const a = run(runs, 0).sessionId;

    await b.handlers.onMessage(mention("m2", OWNER, "new topic."));
    expect(runs).toHaveLength(1);
    expect(b.replies).toEqual([{ channelId: CHAN, content: NEW_TOPIC_ACK, replyToMessageId: "m2" }]);
    expect(b.store.get(a)).toBeUndefined();

    // A reply to the ack goes to the fresh session, with nothing replayed.
    await b.handlers.onMessage(replyTo("m3", OWNER, "list the open PRs", "bot_1"));
    const fresh = run(runs, 1);
    expect(fresh.sessionId).not.toBe(a);
    expect(fresh.humanText).toBe("list the open PRs");
    expect(fresh.prompt).not.toContain("PELICAN");
    // So does the next @mention.
    await b.handlers.onMessage(mention("m4", OWNER, "and the closed ones?"));
    expect(run(runs, 2).sessionId).toBe(fresh.sessionId);
  });

  test("a 'new topic' sent while a run is going waits for it, then starts fresh; a later message waits behind it", async () => {
    const { agent, runs } = stubAgent(true);
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(mention("m1", OWNER, "build the thing"));
    expect(await until(() => runs.length === 1)).toBe(true);
    const a = run(runs, 0).sessionId;

    const second = b.handlers.onMessage(mention("m2", OWNER, "new topic: write the docs"));
    await settle();
    const third = b.handlers.onMessage(mention("m3", OWNER, "and the tests"));
    await settle();
    // Waiting: no second run, no new progress message, the open session not parked.
    expect(runs).toHaveLength(1);
    expect(b.outbound.sends).toHaveLength(1);
    expect(b.store.get(a)).toBeDefined();

    runs[0]!.finish("built");
    await first;
    expect(await until(() => runs.length === 2)).toBe(true);
    const fresh = run(runs, 1);
    expect(fresh.sessionId).not.toBe(a);
    expect(fresh).toMatchObject({ resume: false, humanText: withTrailer("write the docs") });
    expect(fresh.prompt).not.toContain("build the thing");
    expect(b.store.get(a)).toBeUndefined();
    await settle();
    // The message sent after it waits behind it, on the fresh session.
    expect(runs).toHaveLength(2);
    runs[1]!.finish();
    await second;
    expect(await until(() => runs.length === 3)).toBe(true);
    expect(run(runs, 2)).toMatchObject({ sessionId: fresh.sessionId, resume: true });
    expect(run(runs, 2).prompt).toContain("write the docs");
    runs[2]!.finish();
    await third;
  });

  test("'stop' while a 'new topic' waits stops the run it waits for; the new topic then runs fresh", async () => {
    const { agent, runs } = stubAgent(true);
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(mention("m1", OWNER, "build the thing"));
    expect(await until(() => runs.length === 1)).toBe(true);
    const a = run(runs, 0).sessionId;
    const second = b.handlers.onMessage(mention("m2", OWNER, "new topic: write the docs"));
    await settle();

    await b.handlers.onMessage(mention("m3", OWNER, "stop"));
    expect(runs[0]!.aborted).toBe(true);
    expect(b.replies.map((r) => r.content)).toEqual([RUN_STOP_ACK]);
    await first;
    expect(await until(() => runs.length === 2)).toBe(true);
    expect(run(runs, 1).sessionId).not.toBe(a);
    expect(run(runs, 1).humanText).toBe(withTrailer("write the docs"));
    expect(runs[1]!.aborted).toBe(false);
    runs[1]!.finish();
    await second;
    expect(b.store.get(a)).toBeUndefined();
  });

  test("every gate still comes first: mute, deny list and the channel allowlist leave the open session alone", async () => {
    const { agent, runs } = stubAgent();
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(mention("m1", MEMBER, "the codeword is PELICAN"));
    const a = run(runs, 0).sessionId;

    b.result.muteUser(MEMBER);
    await b.handlers.onMessage(mention("m2", MEMBER, "new topic: X"));
    b.result.unmuteUser(MEMBER);
    b.result.config.allowlist.discord.denyUsers.push(MEMBER);
    await b.handlers.onMessage(mention("m3", MEMBER, "new topic: X"));
    b.result.config.allowlist.discord.denyUsers.pop();
    await b.handlers.onMessage({ ...mention("m4", MEMBER, "new topic: X"), channelId: "elsewhere" });

    expect(runs).toHaveLength(1);
    expect(b.store.get(a)).toBeDefined();
    // Past the gates, the open session is still theirs and a plain mention continues it.
    await b.handlers.onMessage(mention("m5", MEMBER, "what was it?"));
    expect(run(runs, 1)).toMatchObject({ sessionId: a, resume: true });
  });

  test("muted while it waits: nothing is parked, run or posted", async () => {
    const { agent, runs } = stubAgent(true);
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(mention("m1", MEMBER, "build the thing"));
    expect(await until(() => runs.length === 1)).toBe(true);
    const a = run(runs, 0).sessionId;
    const second = b.handlers.onMessage(mention("m2", MEMBER, "new topic: write the docs"));
    await settle();
    b.result.muteUser(MEMBER);
    runs[0]!.finish("built");
    await first;
    await second;
    await settle();
    expect(runs).toHaveLength(1);
    expect(b.store.get(a)).toBeDefined();
    expect(b.outbound.sends).toHaveLength(1);
    expect(b.replies).toHaveLength(0);
  });
  test("a wait longer than the soft TTL: the fresh session is kept, so the request and the message after it both run there", async () => {
    let clock = Date.now();
    const { agent, runs } = stubAgent(true);
    const b = await bridgeWith(agent, { now: () => clock });
    const first = b.handlers.onMessage(mention("m1", OWNER, "build the thing"));
    expect(await until(() => runs.length === 1)).toBe(true);
    const a = run(runs, 0).sessionId;
    const second = b.handlers.onMessage(mention("m2", OWNER, "new topic: write the docs"));
    await settle();
    const third = b.handlers.onMessage(mention("m3", OWNER, "and the tests"));
    await settle();
    // The open session's run outlasts the TTL; any lookup purges idle sessions.
    clock += TTL_MS + 60_000;
    b.store.list();
    const fourth = b.handlers.onMessage(mention("m4", MEMBER, "hello"));
    expect(await until(() => runs.length === 2)).toBe(true);
    runs[1]!.finish();
    await fourth;

    runs[0]!.finish("built");
    await first;
    expect(await until(() => runs.length === 3)).toBe(true);
    const fresh = run(runs, 2);
    expect(fresh.sessionId).not.toBe(a);
    expect(fresh.humanText).toBe(withTrailer("write the docs"));
    expect(b.store.get(fresh.sessionId)).toBeDefined();
    runs[2]!.finish();
    await second;
    // The message sent after it is not dropped: it continues the fresh session.
    expect(await until(() => runs.length === 4)).toBe(true);
    expect(run(runs, 3)).toMatchObject({ sessionId: fresh.sessionId, resume: true });
    expect(run(runs, 3).prompt).toContain("write the docs");
    runs[3]!.finish();
    await third;
    expect(b.store.get(a)).toBeUndefined();
  });
  test("a reply to one of the open session's answers sent while a 'new topic' waits still continues that session", async () => {
    const { agent, runs } = stubAgent(true);
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(mention("m1", OWNER, "the codeword is PELICAN"));
    expect(await until(() => runs.length === 1)).toBe(true);
    runs[0]!.finish();
    await first;
    const a = run(runs, 0).sessionId;
    const oldAnswer = answerId(b.outbound, 0);
    const busy = b.handlers.onMessage(mention("m2", OWNER, "build the thing"));
    expect(await until(() => runs.length === 2)).toBe(true);

    const fresh = b.handlers.onMessage(mention("m3", OWNER, "new topic: write the docs"));
    await settle();
    const reply = b.handlers.onMessage(replyTo("m4", OWNER, "what was the codeword?", oldAnswer));
    await settle();
    expect(runs).toHaveLength(2);

    runs[1]!.finish("built");
    await busy;
    expect(await until(() => runs.length === 4, 2000)).toBe(true);
    const byText = (t: string) => runs.find((r) => r.input.humanText?.startsWith(t));
    const topic = byText("write the docs");
    const old = byText("what was the codeword?");
    expect(topic?.input.sessionId).not.toBe(a);
    expect(topic?.input.prompt).not.toContain("PELICAN");
    // The reply is not dropped: it runs in the session it answers, with its turns.
    expect(old?.input).toMatchObject({ sessionId: a, resume: true });
    expect(old?.input.prompt).toContain("PELICAN");
    topic!.finish();
    old!.finish();
    await fresh;
    await reply;
    // A plain @mention still goes to the fresh session.
    const fifth = b.handlers.onMessage(mention("m5", OWNER, "and the tests"));
    expect(await until(() => runs.length === 5)).toBe(true);
    expect(run(runs, 4).sessionId).toBe(topic!.input.sessionId);
    runs[4]!.finish();
    await fifth;
  });
});
