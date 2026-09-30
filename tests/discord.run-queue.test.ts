/**
 * AGENT-3.a / AGENT-3.b (#122, REQ-discord-301): one run at a time per
 * Discord session. A message sent while a run of its session is going waits
 * for it (first in, first out) instead of starting a second run, silently
 * (no new indicator: its progress message comes when its turn starts), and
 * then goes on as if it had just arrived; runs of different sessions go in
 * parallel. A waiting message is an in-flight reply (REQ-discord-311). After
 * waiting, a session that ended or a requester who was forgotten runs
 * nothing. An ask pick, `/session start` and `/work` take the same turn, and
 * the bridge's stop starts no waiting message and aborts the run going.
 *
 * Dry-run bridge, fake gateway, in-memory outbound, stub agents that wait
 * until the test lets them finish (the configured model comes from the fake
 * LLM fixture; no model is called), temp non-git projects; no network.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentClient, AgentRunChatOpts } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { InflightReplyStore } from "../src/discord/inflight-replies.ts";
import { SessionRunControl } from "../src/discord/run-control.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashInteraction } from "../src/discord/slash-types.ts";
import type { InboundMessage } from "../src/discord/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";
import { teamPeopleFile } from "./fixtures/team-people.ts";

// The footer names the configured model; there is no built-in default
// (AGENT-13), so this file configures one (the stub agents call no model).
useConfiguredModel();

const OWNER = "111100002222000033";
const ALICE = "200000000000000002";
const BOB = "300000000000000003";

const temps: string[] = [];
function tempDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

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

type Gate = { input: AgentRunChatOpts; finish: (summary?: string) => void; aborted: boolean };

/** A stub agent whose every run waits until the test finishes it (or its signal aborts). */
function gatedAgent() {
  const runs: Gate[] = [];
  const agent: AgentClient = {
    runChat(input) {
      return new Promise((resolve) => {
        const gate: Gate = {
          input,
          aborted: false,
          finish: (summary) =>
            resolve({
              ok: true,
              sessionId: input.sessionId,
              summary: summary ?? `answer to: ${input.humanText}`,
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
      });
    },
  };
  return { agent, runs };
}

async function bridgeWith(
  agent: AgentClient,
  opts: {
    db?: ReturnType<typeof openCorvidinhoDb>;
    allowlistFile?: string;
    /** A store with no DB (a session ended mid-run leaves no dangling row write). */
    noDb?: boolean;
  } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Array<{ channelId: string; content: string; replyToMessageId?: string }> = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1,chan-2",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: opts.allowlistFile ?? join(tempDir("corvidinho-runq-"), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    },
    projectRoot: tempDir("corvidinho-runq-proj-"),
    skipProtocolCheck: true,
    disableScheduler: true,
    approvalPollMs: 0,
    ...(opts.db ? { db: opts.db } : {}),
    ...(opts.noDb ? { sessionStore: new SessionStore({ ttlMs: 60 * 60 * 1000 }) } : {}),
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
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, outbound, replies };
}

/** A message in thread `thr` (parent chan-1); the first one @mentions the bot. */
function inThread(id: string, authorId: string, content: string, opts: { thr?: string; mention?: boolean } = {}): InboundMessage {
  return {
    id,
    channelId: "chan-1",
    threadId: opts.thr ?? "thr-1",
    authorId,
    authorBot: false,
    content: opts.mention ? `<@999> ${content}` : content,
    mentionedBot: opts.mention === true,
  };
}

describe("a message sent while its session's run is going waits for it (AGENT-3.a, REQ-discord-301)", () => {
  test("the second message starts no second run; it runs after the first, with the first answer in its thread", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", ALICE, "build the thing", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);

    const second = b.handlers.onMessage(inThread("m2", ALICE, "and add tests"));
    await settle();
    // Waiting: no second run, and no new indicator (no second progress message).
    expect(runs).toHaveLength(1);
    expect(b.outbound.sends).toHaveLength(1);

    runs[0]!.finish("first answer");
    await first;
    expect(await until(() => runs.length === 2)).toBe(true);
    // Its normal progress message comes when its turn starts.
    expect(b.outbound.sends).toHaveLength(2);
    expect(b.outbound.sends[1]!.replyToMessageId).toBe("m2");
    expect(runs[1]!.input.sessionId).toBe(runs[0]!.input.sessionId);
    expect(runs[1]!.input.humanText).toBe("and add tests");
    // It goes on as if sent after the first answer: that answer is in its thread.
    expect(runs[1]!.input.prompt).toContain("first answer");
    expect(runs[1]!.input.resume).toBe(true);
    runs[1]!.finish();
    await second;
    const answers = b.outbound.contentEdits.map((e) => e.content);
    expect(answers).toContain("first answer");
    expect(answers).toContain("answer to: and add tests");
    await b.result.stop();
  });

  test("three messages run one after another, first in first out", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const all = [b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }))];
    expect(await until(() => runs.length === 1)).toBe(true);
    all.push(b.handlers.onMessage(inThread("m2", ALICE, "two")));
    all.push(b.handlers.onMessage(inThread("m3", ALICE, "three")));
    await settle();
    expect(runs).toHaveLength(1);
    runs[0]!.finish();
    expect(await until(() => runs.length === 2)).toBe(true);
    await settle();
    expect(runs).toHaveLength(2);
    runs[1]!.finish();
    expect(await until(() => runs.length === 3)).toBe(true);
    runs[2]!.finish();
    await Promise.all(all);
    expect(runs.map((r) => r.input.humanText?.split("\n")[0])).toEqual(["one", "two", "three"]);
    await b.result.stop();
  });

  test("different sessions still run in parallel", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const a = b.handlers.onMessage(inThread("a1", ALICE, "alice asks", { mention: true }));
    const c = b.handlers.onMessage(inThread("b1", BOB, "bob asks", { mention: true }));
    const d = b.handlers.onMessage({
      id: "c1",
      channelId: "chan-2",
      authorId: ALICE,
      authorBot: false,
      content: "<@999> other channel",
      mentionedBot: true,
    });
    expect(await until(() => runs.length === 3)).toBe(true);
    expect(new Set(runs.map((r) => r.input.sessionId)).size).toBe(3);
    for (const r of runs) r.finish();
    await Promise.all([a, c, d]);
    await b.result.stop();
  });

  test("a waiting message is an in-flight reply from when it starts waiting (REQ-discord-311)", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent, { db });
    const rows = () => new InflightReplyStore(db).list();
    const first = b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const second = b.handlers.onMessage(inThread("m2", ALICE, "two"));
    await settle();
    // Recorded while it waits, so a restart now would still tell the user.
    expect(rows().map((r) => r.requestMessageId).sort()).toEqual(["m1", "m2"]);
    expect(rows().find((r) => r.requestMessageId === "m2")!.progressMessageId).toBeNull();
    runs[0]!.finish();
    expect(await until(() => runs.length === 2)).toBe(true);
    // Its progress message is on its row once its turn started.
    expect(await until(() => rows().some((r) => r.requestMessageId === "m2" && r.progressMessageId !== null))).toBe(true);
    runs[1]!.finish();
    await Promise.all([first, second]);
    expect(rows()).toEqual([]);
    await b.result.stop();
  });

  test("a message whose session ended while it waited runs nothing and posts nothing", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent, { noDb: true });
    const first = b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const second = b.handlers.onMessage(inThread("m2", ALICE, "two"));
    await settle();
    const session = b.result.store.get(runs[0]!.input.sessionId)!;
    await b.result.store.endSession(session);
    runs[0]!.finish();
    await Promise.all([first, second]);
    await settle();
    expect(runs).toHaveLength(1);
    expect(b.outbound.sends).toHaveLength(1);
    expect(b.replies).toEqual([]);
    await b.result.stop();
  });

  test("an ask pick waits behind a chat run of its session, then resumes it", async () => {
    const calls: AgentRunChatOpts[] = [];
    const gates: Array<() => void> = [];
    const agent: AgentClient = {
      runChat(input) {
        calls.push(input);
        if (calls.length === 1) {
          return Promise.resolve({
            ok: true,
            sessionId: input.sessionId,
            summary: "Pick one",
            exitCode: 0,
            ask: { reason: "clarify", question: "Which one?", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
          });
        }
        return new Promise((resolve) => {
          gates.push(() => resolve({ ok: true, sessionId: input.sessionId, summary: `ran: ${input.humanText}`, exitCode: 0 }));
        });
      },
    };
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(inThread("m1", ALICE, "choose for me", { mention: true }));
    const session = b.result.store.getByThread("thr-1", ALICE)!;
    const askId = session.pendingAsk!.askId;
    // A chat message starts a run (the Choose ask stays open) …
    const chat = b.handlers.onMessage(inThread("m2", ALICE, "meanwhile, this"));
    expect(await until(() => calls.length === 2)).toBe(true);
    // … and the pick made while it runs waits for it.
    const pressReplies: unknown[] = [];
    const pick = b.handlers.onComponent!({
      id: "ix1",
      customId: pickCustomId(askId, "a"),
      channelId: "thr-1",
      userId: ALICE,
      messageId: session.pendingAsk!.stubMessageId ?? "stub",
      reply: async (p: unknown) => void pressReplies.push(p),
      deleteReply: async () => {},
    } as never);
    await settle();
    expect(calls).toHaveLength(2);
    expect(pressReplies).toHaveLength(1);
    gates[0]!();
    expect(await until(() => calls.length === 3)).toBe(true);
    expect(calls[2]!.humanText).toBe("Alpha");
    expect(calls[2]!.prompt).toContain("ran: meanwhile, this");
    gates[1]!();
    await Promise.all([chat, pick]);
    await b.result.stop();
  });

  test("/session start and /work runs take their session's turn: the requester's @mention meanwhile waits", async () => {
    for (const command of ["session", "work"] as const) {
      const { agent, runs } = gatedAgent();
      const b = await bridgeWith(agent, { allowlistFile: teamPeopleFile(ALICE) });
      const ix: SlashInteraction = {
        id: `ix_${command}`,
        commandName: command,
        ...(command === "session" ? { subcommand: "start" } : {}),
        channelId: "chan-1",
        userId: ALICE,
        options: command === "session" ? { topic: "plan it" } : { description: "do it" },
        reply: async () => {},
        deferReply: async () => {},
        editReply: async () => {},
        deleteReply: async () => {},
      };
      const slash = b.handlers.onSlash!(ix);
      expect(await until(() => runs.length === 1)).toBe(true);
      const chat = b.handlers.onMessage({
        id: `m_${command}`,
        channelId: "chan-1",
        authorId: ALICE,
        authorBot: false,
        content: "<@999> one more thing",
        mentionedBot: true,
      });
      await settle();
      expect({ command, runs: runs.length }).toEqual({ command, runs: 1 });
      runs[0]!.finish();
      expect(await until(() => runs.length === 2)).toBe(true);
      expect(runs[1]!.input.sessionId).toBe(runs[0]!.input.sessionId);
      runs[1]!.finish();
      await Promise.all([slash, chat]);
      await b.result.stop();
    }
  });

  test("the bridge's stop aborts the run going and starts no waiting message; both replies stay in flight for the next start", async () => {
    const db = openCorvidinhoDb({ memory: true });
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent, { db });
    const first = b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const second = b.handlers.onMessage(inThread("m2", ALICE, "two"));
    await settle();
    await b.result.stop();
    await Promise.all([first, second]);
    expect(runs[0]!.aborted).toBe(true);
    expect(runs).toHaveLength(1);
    // Nothing is posted as the bridge goes down; the rows are for the restart notice.
    expect(b.outbound.contentEdits).toEqual([]);
    expect(new InflightReplyStore(db).list().map((r) => r.requestMessageId).sort()).toEqual(["m1", "m2"]);
  });
});

describe("SessionRunControl (REQ-discord-301)", () => {
  test("FIFO per session, parallel across sessions, idempotent done", async () => {
    const rc = new SessionRunControl();
    const a1 = rc.enqueue({ sessionId: "s1", requesterId: "u", channelId: "c" });
    const a2 = rc.enqueue({ sessionId: "s1", requesterId: "u", channelId: "c" });
    const b1 = rc.enqueue({ sessionId: "s2", requesterId: "v", channelId: "c" });
    expect(a1.waited).toBe(false);
    expect(a2.waited).toBe(true);
    expect(b1.waited).toBe(false);
    expect(await a1.ready).toBe(true);
    expect(await b1.ready).toBe(true);
    expect(rc.current("s1")?.runId).toBe(a1.runId);
    let a2Ready = false;
    void a2.ready.then(() => {
      a2Ready = true;
    });
    await settle();
    expect(a2Ready).toBe(false);
    a1.done();
    a1.done();
    expect(await a2.ready).toBe(true);
    expect(rc.current("s1")?.runId).toBe(a2.runId);
    a2.done();
    b1.done();
    await settle();
    expect(rc.busy("s1")).toBe(false);
    expect(rc.busy("s2")).toBe(false);
  });

  test("a turn released before its go never starts; a forgotten requester's waiting turn says so", async () => {
    const rc = new SessionRunControl();
    const a1 = rc.enqueue({ sessionId: "s1", requesterId: "u", channelId: "c" });
    const a2 = rc.enqueue({ sessionId: "s1", requesterId: "u", channelId: "c" });
    const a3 = rc.enqueue({ sessionId: "s1", requesterId: "u", channelId: "c" });
    a2.done();
    rc.noteForgotten(["u"]);
    expect(a3.requesterForgotten).toBe(true);
    a1.done();
    expect(await a2.ready).toBe(false);
    expect(await a3.ready).toBe(true);
    a3.done();
  });

  test("close aborts the running turn and no waiting turn starts", async () => {
    const rc = new SessionRunControl();
    const a1 = rc.enqueue({ sessionId: "s1", requesterId: "u", channelId: "c" });
    const a2 = rc.enqueue({ sessionId: "s1", requesterId: "u", channelId: "c" });
    expect(await a1.ready).toBe(true);
    rc.close();
    expect(a1.signal.aborted).toBe(true);
    expect(a1.stopReason).toBe("closed");
    a1.done();
    expect(await a2.ready).toBe(false);
    a2.done();
    const late = rc.enqueue({ sessionId: "s3", requesterId: "u", channelId: "c" });
    expect(await late.ready).toBe(false);
    late.done();
    await rc.settle(1000);
  });
});
