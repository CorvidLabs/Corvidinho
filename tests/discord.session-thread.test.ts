/**
 * AGENT-6 (REQ-discord-072) — a Discord session keeps its thread: every agent
 * run on a session is recorded with it (the human's words and the answer the
 * bridge posted), and a continued run gets the earlier turns replayed ahead of
 * the new message. Bounded by SESSION-2/3 (only the live session, never after
 * idle expiry), SESSION-MULTI-1 (never another user's session), SAFE-4 (confirm
 * tokens only from the current message) and SAFE-6 (stored turns scrubbed).
 * Driven through `startBridge` with a fake gateway; no live Discord.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { spendCapReachedAsk } from "../src/agent/spend-notice.ts";
import { planningSelectionText, selectRelevantSpecs } from "../src/agent/specLoader.ts";
import type { HumanAsk } from "../src/agent/types.ts";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashInteraction } from "../src/discord/slash-types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { teamPeopleFile } from "./fixtures/team-people.ts";

const CHAN = "chan-1";
const OWNER = "100000000000000001";
const MEMBER = "100000000000000002";
const OTHER = "100000000000000003";
const TTL_MS = 45 * 60 * 1000;

/** Missing allowlist file: never read the operator's allowlist (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-thread-")), "none.toml");

/** Bridges started by a test; stopped after it even when an expect fails. */
const running: Array<{ stop: () => Promise<void> }> = [];
const cleanups: Array<() => void> = [];
afterEach(async () => {
  for (const r of running.splice(0)) await r.stop();
  for (const c of cleanups.splice(0)) c();
});

type Call = Pick<AgentRunChatOpts, "prompt" | "humanText" | "sessionId" | "resume" | "actingUserId">;

/** Agent reply for the Nth run (1-based): summary text, or a summary + ask. */
type Script = (n: number, opts: AgentRunChatOpts) => string | { summary: string; ask: HumanAsk };

async function bridgeWith(
  script: Script,
  extra: { db?: Database; sessionStore?: SessionStore; projectRoot?: string; allowlistFile?: string } = {},
) {
  const calls: Call[] = [];
  const agent: AgentClient = {
    async runChat(opts) {
      calls.push({
        prompt: opts.prompt,
        humanText: opts.humanText,
        sessionId: opts.sessionId,
        resume: opts.resume,
        actingUserId: opts.actingUserId,
      });
      const out = script(calls.length, opts);
      return typeof out === "string"
        ? { ok: true, sessionId: opts.sessionId, summary: out, exitCode: 0 }
        : {
            ok: true,
            sessionId: opts.sessionId,
            summary: out.summary,
            exitCode: 0,
            ask: out.ask,
            task: { verified: false, verifySkipped: true, state: "blocked" },
          };
    },
  };
  const outbound = memoryThinkingOutbound();
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: extra.allowlistFile ?? NO_ALLOWLIST,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: extra.projectRoot ?? mkdtempSync(join(tmpdir(), "corvidinho-thread-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    ...(extra.db ? { db: extra.db } : {}),
    ...(extra.sessionStore ? { sessionStore: extra.sessionStore } : {}),
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      let n = 0;
      handlers.reply = async () => {
        n += 1;
        return { messageId: `bot-reply-${n}` };
      };
      return createNullGateway();
    },
  });
  if (result.ok !== true || !box.handlers) throw new Error("bridge did not start");
  running.push(result);
  return { result, handlers: box.handlers, calls, outbound };
}

/** IDENTITY-11.a: community can't start /work, so /work runs declare MEMBER team. */
function teamFor(command: "session" | "work"): { allowlistFile?: string } {
  return command === "work" ? { allowlistFile: teamPeopleFile(MEMBER) } : {};
}

/** Message id of the answer the Nth run was collapsed into (DISCORD-ASK-7). */
function answerId(outbound: ReturnType<typeof memoryThinkingOutbound>, i: number): string {
  const send = outbound.sends[i];
  if (!send) throw new Error(`no progress message #${i}`);
  return send.messageId;
}

function mention(id: string, authorId: string, content: string) {
  return { id, channelId: CHAN, authorId, authorBot: false, content, mentionedBot: true };
}

function replyTo(id: string, authorId: string, content: string, ref: string, ping = false) {
  return {
    id,
    channelId: CHAN,
    authorId,
    authorBot: false,
    content,
    mentionedBot: ping,
    referencedMessageId: ref,
  };
}

function slash(opts: {
  n: number;
  command: "session" | "work";
  userId: string;
  text: string;
}): SlashInteraction {
  return {
    id: `ix-${opts.n}`,
    commandName: opts.command,
    ...(opts.command === "session" ? { subcommand: "start" } : {}),
    channelId: CHAN,
    userId: opts.userId,
    options: opts.command === "session" ? { topic: opts.text } : { description: opts.text },
    reply: async () => {},
    deferReply: async () => {},
    editReply: async () => ({ messageId: `slash-reply-${opts.n}` }),
    deleteReply: async () => {},
  };
}

function call(calls: Call[], i: number): Call {
  const c = calls[i];
  if (!c) throw new Error(`no agent call #${i}`);
  return c;
}

const OPENING = "the codeword is PELICAN, keep it for this task";
const ANSWER_1 = "Noted: I will keep the codeword for this task.";

describe("session thread replay (AGENT-6 / REQ-discord-072)", () => {
  test("a reply that continues a session carries the earlier request and answer", async () => {
    const { handlers, calls, outbound } = await bridgeWith((n) =>
      n === 1 ? ANSWER_1 : "It was PELICAN.",
    );
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    await handlers.onMessage(replyTo("m2", OWNER, "what was the codeword?", answerId(outbound, 0)));

    expect(calls).toHaveLength(2);
    const first = call(calls, 0);
    const second = call(calls, 1);
    expect(second).toMatchObject({
      sessionId: first.sessionId,
      resume: true,
      // SAFE-4: the raw human text is the current message only.
      humanText: "what was the codeword?",
    });
    expect(second.prompt).toContain(OPENING);
    expect(second.prompt).toContain(ANSWER_1);
    // Earlier turns come first, oldest first; the new message comes last.
    const p = second.prompt;
    expect(p.indexOf(OPENING)).toBeLessThan(p.indexOf(ANSWER_1));
    expect(p.indexOf(ANSWER_1)).toBeLessThan(p.lastIndexOf("what was the codeword?"));
    // The opening run had nothing earlier to replay.
    expect(first.prompt).not.toContain(ANSWER_1);
  });

  test("an @mention that continues the user's live session carries its thread too", async () => {
    const { handlers, calls } = await bridgeWith((n) => (n === 1 ? ANSWER_1 : "ok"));
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    await handlers.onMessage(mention("m2", OWNER, "and the codeword again?"));
    expect(call(calls, 1).sessionId).toBe(call(calls, 0).sessionId);
    expect(call(calls, 1).prompt).toContain(OPENING);
    expect(call(calls, 1).prompt).toContain(ANSWER_1);
  });

  test("every turn stays in the thread, oldest first, across several replies", async () => {
    const { handlers, calls, outbound } = await bridgeWith((n) => `answer number ${n}`);
    await handlers.onMessage(mention("m1", OWNER, "request number 1"));
    await handlers.onMessage(replyTo("m2", OWNER, "request number 2", answerId(outbound, 0)));
    await handlers.onMessage(replyTo("m3", OWNER, "request number 3", answerId(outbound, 1)));
    const p = call(calls, 2).prompt;
    const order = [
      "request number 1",
      "answer number 1",
      "request number 2",
      "answer number 2",
    ].map((s) => p.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(p.lastIndexOf("request number 3")).toBeGreaterThan(order[3]!);
    expect(p).not.toContain("answer number 3");
  });

  test("the thread survives a bridge restart within the soft TTL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "corvidinho-thread-db-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, "corvidinho.db");
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-thread-proj-"));

    const db1 = openCorvidinhoDb({ path });
    const one = await bridgeWith(() => ANSWER_1, { db: db1, projectRoot });
    await one.handlers.onMessage(mention("m1", OWNER, OPENING));
    const answer = answerId(one.outbound, 0);
    const sessionId = call(one.calls, 0).sessionId;
    await one.result.stop();
    running.splice(running.indexOf(one.result), 1);
    db1.close();

    const db2 = openCorvidinhoDb({ path });
    cleanups.push(() => db2.close());
    const two = await bridgeWith(() => "It was PELICAN.", { db: db2, projectRoot });
    await two.handlers.onMessage(replyTo("m2", OWNER, "what was the codeword?", answer));
    expect(two.calls).toHaveLength(1);
    expect(call(two.calls, 0)).toMatchObject({ sessionId, resume: true });
    expect(call(two.calls, 0).prompt).toContain(OPENING);
    expect(call(two.calls, 0).prompt).toContain(ANSWER_1);
  });

  test("the request is stored as the run starts, so a bridge that dies mid-run keeps it", async () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    let seenMidRun: string[] = [];
    const { calls } = await bridgeWith(
      (_n, opts) => {
        // What a bridge restarted right now would load from the shared DB.
        const reopened = new SessionStore({ db, ttlMs: TTL_MS });
        const live = reopened.get(opts.sessionId);
        seenMidRun = live ? reopened.threadFor(live).map((t) => `${t.role}:${t.content}`) : [];
        return ANSWER_1;
      },
      { db },
    ).then(async (b) => {
      await b.handlers.onMessage(mention("m1", OWNER, OPENING));
      return b;
    });
    expect(calls).toHaveLength(1);
    expect(seenMidRun).toEqual([`human:${OPENING}`]);
  });

  for (const command of ["session", "work"] as const) {
    test(`a reply to a /${command === "session" ? "session start" : "work"} answer carries its ${command === "session" ? "topic" : "description"} and answer`, async () => {
      const text = "draft the HERON release notes";
      const summary = "Drafted the notes under the HERON heading.";
      // IDENTITY-11.a: /work needs the member declared team.
      const { handlers, calls, outbound } = await bridgeWith((n) => (n === 1 ? summary : "done"), teamFor(command));
      await handlers.onSlash!(slash({ n: 1, command, userId: MEMBER, text }));
      await handlers.onMessage(replyTo("m2", MEMBER, "now shorten them", answerId(outbound, 0)));
      expect(calls).toHaveLength(2);
      const second = call(calls, 1);
      expect(second).toMatchObject({
        sessionId: call(calls, 0).sessionId,
        resume: true,
        humanText: "now shorten them",
      });
      expect(second.prompt).toContain(text);
      expect(second.prompt).toContain(summary);
    });
  }

  test("a button-pick resume carries the original request, not just the question and label", async () => {
    const ask: HumanAsk = {
      reason: "clarify",
      question: "Which database should back it?",
      options: [
        { id: "1", label: "Postgres" },
        { id: "2", label: "SQLite" },
      ],
    };
    const request = "set up storage for the PELICAN service";
    const { result, handlers, calls, outbound } = await bridgeWith((n) =>
      n === 1 ? { summary: "Needs your input", ask } : `answer number ${n}`,
    );
    await handlers.onMessage(mention("m1", OWNER, request));
    const pending = result.store.list()[0]!.pendingAsk!;
    await handlers.onComponent!({
      id: "ix-pick",
      customId: pickCustomId(pending.askId, "1"),
      channelId: CHAN,
      userId: OWNER,
      messageId: pending.stubMessageId,
      reply: async () => {},
      deleteReply: async () => {},
    });
    expect(calls).toHaveLength(2);
    const picked = call(calls, 1);
    expect(picked).toMatchObject({ sessionId: call(calls, 0).sessionId, humanText: "Postgres" });
    expect(picked.prompt).toContain(request);
    expect(picked.prompt).toContain(ask.question);

    // The next reply sees the whole exchange, the pick included.
    await handlers.onMessage(replyTo("m3", OWNER, "is it ready?", answerId(outbound, 0)));
    const next = call(calls, 2);
    expect(next.sessionId).toBe(call(calls, 0).sessionId);
    for (const s of [request, ask.question, "Postgres", "answer number 2"]) {
      expect(next.prompt).toContain(s);
    }
  });

  test("a spend-cap stop keeps the request in the thread but never its cap text (REQ-discord-098)", async () => {
    const cap = spendCapReachedAsk({
      spentMicroUsd: 4_999_000,
      estimateMicroUsd: 2_600,
      capMicroUsd: 5_000_000,
    });
    const { handlers, calls, outbound } = await bridgeWith((n) =>
      n === 1 ? { summary: "paused", ask: cap } : "done",
    );
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    await handlers.onMessage(
      replyTo("m2", OWNER, "the cap is raised, carry on", answerId(outbound, 0)),
    );
    const p = call(calls, 1).prompt;
    expect(p).toContain(OPENING);
    expect(p).not.toContain("Daily spend cap reached");
    expect(p).not.toContain("Prior clarifying question");
  });

  test("the replayed block never picks a Planning module the new message does not name (REQ-agent-004)", async () => {
    const multi = "Plan for the agent loop:\n\nStep one touches the plugins registry.\n\nStep two, the watch poller.";
    const { handlers, calls, outbound } = await bridgeWith((n) => (n === 1 ? multi : "ok"));
    await handlers.onMessage(mention("m1", OWNER, "tidy the cli help"));
    await handlers.onMessage(replyTo("m2", OWNER, "yes please go ahead", answerId(outbound, 0)));
    const p = call(calls, 1).prompt;
    // The model gets the thread…
    expect(p).toContain("tidy the cli help");
    expect(p).toContain("Step two, the watch poller.");
    // …but Planning selects from the new message only (identity, memory and
    // the thread block are all `[Corvidinho …]` paragraphs).
    expect(planningSelectionText(p)).toBe("yes please go ahead");
    expect(
      selectRelevantSpecs(planningSelectionText(p), ["agent", "cli", "discord", "plugins", "watch"], 3),
    ).toEqual([]);
  });

  test("a chat run that throws keeps its request, so the next message continues the thread", async () => {
    const { handlers, calls } = await bridgeWith((n) => {
      if (n === 1) throw new Error("agent spawn failed");
      return "ok";
    });
    await expect(handlers.onMessage(mention("m1", OWNER, OPENING))).rejects.toThrow(
      "agent spawn failed",
    );
    await handlers.onMessage(mention("m2", OWNER, "try that again"));
    const again = call(calls, 1);
    expect(again.sessionId).toBe(call(calls, 0).sessionId);
    expect(again.prompt).toContain(OPENING);
    expect(again.prompt).toContain("agent spawn failed");
    expect(again.humanText).toBe("try that again");
  });

  for (const command of ["session", "work"] as const) {
    test(`a /${command === "session" ? "session start" : "work"} run that throws keeps its ${command === "session" ? "topic" : "description"} for the reply`, async () => {
      const text = "draft the HERON release notes";
      const { handlers, calls, outbound } = await bridgeWith((n) => {
        if (n === 1) throw new Error("agent spawn failed");
        return "done";
      }, teamFor(command));
      await handlers.onSlash!(slash({ n: 1, command, userId: MEMBER, text }));
      await handlers.onMessage(replyTo("m2", MEMBER, "try again", answerId(outbound, 0)));
      expect(calls).toHaveLength(2);
      expect(call(calls, 1)).toMatchObject({ sessionId: call(calls, 0).sessionId, resume: true });
      expect(call(calls, 1).prompt).toContain(text);
    });
  }

  test("replayed turns are scrubbed of secrets, in the prompt and at rest (SAFE-6)", async () => {
    const token = `ghp_${"A1b2C3d4E5".repeat(4)}`;
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const { handlers, calls, outbound } = await bridgeWith(() => "stored", { db });
    await handlers.onMessage(mention("m1", OWNER, `use ${token} for the mirror`));
    await handlers.onMessage(replyTo("m2", OWNER, "go on", answerId(outbound, 0)));
    const p = call(calls, 1).prompt;
    expect(p).toContain("use [redacted:github-token] for the mirror");
    expect(p).not.toContain(token);
    const rows = db.query("SELECT content FROM discord_session_turns").all() as Array<{
      content: string;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.content).not.toContain(token);
  });
});

describe("session thread stays inside its session (SESSION-3 / SESSION-MULTI-1 / SAFE-4)", () => {
  test("a session idle past the soft TTL starts fresh with no replayed turns", async () => {
    let now = 1_000_000;
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const projectRoot = mkdtempSync(join(tmpdir(), "corvidinho-thread-proj-"));
    const sessionStore = new SessionStore({
      db,
      ttlMs: TTL_MS,
      now: () => now,
      defaultProjectRoot: projectRoot,
    });
    const { handlers, calls } = await bridgeWith(() => ANSWER_1, {
      db,
      sessionStore,
      projectRoot,
    });
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    now += TTL_MS + 5_000;
    await handlers.onMessage(mention("m2", OWNER, "what was the codeword?"));
    expect(calls).toHaveLength(2);
    expect(call(calls, 1).sessionId).not.toBe(call(calls, 0).sessionId);
    expect(call(calls, 1).resume).toBe(false);
    expect(call(calls, 1).prompt).not.toContain("PELICAN");
    expect(call(calls, 1).prompt).not.toContain(ANSWER_1);
  });

  test("another user's session never sees my turns, and mine never sees theirs", async () => {
    const { handlers, calls, outbound } = await bridgeWith((n) => `answer number ${n}`);
    await handlers.onMessage(mention("m1", OWNER, OPENING));
    const mine = answerId(outbound, 0);
    // Another member in the same channel: their own session.
    await handlers.onMessage(mention("m2", OTHER, "hello from the other member"));
    // A reply with the ping to my answer: still their own session.
    await handlers.onMessage(replyTo("m3", OTHER, "what was the codeword?", mine, true));
    for (const i of [1, 2]) {
      const c = call(calls, i);
      expect(c.actingUserId).toBe(OTHER);
      expect(c.sessionId).not.toBe(call(calls, 0).sessionId);
      expect(c.prompt).not.toContain("PELICAN");
      expect(c.prompt).not.toContain("answer number 1");
    }
    // My own continuation never carries their words.
    await handlers.onMessage(replyTo("m4", OWNER, "still there?", mine));
    const back = call(calls, 3);
    expect(back.sessionId).toBe(call(calls, 0).sessionId);
    expect(back.prompt).not.toContain("hello from the other member");
    expect(back.prompt).not.toContain("answer number 2");
  });

  test("the human's own words come only from the current message, never from replayed turns", async () => {
    const { handlers, calls, outbound } = await bridgeWith(() => "noted");
    await handlers.onMessage(mention("m1", OWNER, "remember PELICAN"));
    await handlers.onMessage(replyTo("m2", OWNER, "and now the next step", answerId(outbound, 0)));
    expect(call(calls, 0).humanText).toBe("remember PELICAN");
    expect(call(calls, 1).humanText).toBe("and now the next step");
    expect(call(calls, 1).humanText).not.toContain("PELICAN");
  });
});
