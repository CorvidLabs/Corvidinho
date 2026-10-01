/**
 * AGENT-3 / AGENT-3.a / AGENT-3.b (#122, REQ-discord-302): 'stop' or
 * 'cancel' (the whole message) stops a Discord run in flight — from the
 * requester in their session, or from the requester or the owner as a reply
 * to the run's progress message (checked before the bot-message lookup,
 * REQ-discord-002's exception). The run's signal is aborted once (stop is
 * idempotent) and the spawn client kills its whole process tree; the stop
 * gets one short ack and the progress message becomes "⏹ Stopped" with the
 * DISCORD-15/15.a footer. Messages that were waiting still run, in order.
 * With nothing running the words go on as before ('cancel' clears open
 * asks). A run waiting on an Approve card is killed and the card closes as a
 * no (SAFE-20). An ask pick's run, `/session start` and `/work` stop the same
 * way; a stopped `/work` opens no PR.
 *
 * The Stop button (AGENT-3.a, REQ-discord-303): each run's progress message
 * carries one red **Stop** button (`cvstop:<runId>`); a press by the requester
 * or the owner, past the channel, actor and mute/rate gates, stops the run
 * through the same stop path (ephemeral ack); anyone else gets "This Stop
 * button isn't for you.", a stale button "Nothing is running."; the button is
 * cleared when the run is done, failed or stopped, and waiting messages still
 * run after a stop (AGENT-3.b).
 *
 * Dry-run bridge, fake gateway, in-memory outbound; stub agents (the
 * configured model comes from the fake LLM fixture; no model is called) and,
 * for the process tree and the card, the real spawn client over fake agent
 * bins in temp dirs. No network.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emptyConfig } from "../src/allowlist/types.ts";
import { ApprovalStore } from "../src/approvals/store.ts";
import {
  createSpawnAgentClient,
  type AgentClient,
  type AgentRunChatOpts,
} from "../src/discord/agent-client.ts";
import { answerCustomId, openCustomId, pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { routeMessage, type RouterDeps } from "../src/discord/message-router.ts";
import {
  RUN_STOP_ACK,
  RUN_STOP_NOTHING_RUNNING,
  RUN_STOP_NOT_YOURS,
  RUN_STOPPED_TEXT,
  SessionRunControl,
  buildStopComponents,
  isStopRunText,
  parseStopRunCustomId,
  stopRunCustomId,
} from "../src/discord/run-control.ts";
import { InflightReplyStore, recoverInterruptedReplies } from "../src/discord/inflight-replies.ts";
import type { ComponentInteraction } from "../src/discord/gateway.ts";
import { approveCardCustomId } from "../src/discord/approve-card.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { SlashInteraction } from "../src/discord/slash-types.ts";
import { ASK_CANCELLED_ACK } from "../src/discord/thin-ack.ts";
import { THINKING_COLORS } from "../src/discord/thinking-status.ts";
import { ALLOWLIST_DENY_TIP, EPHEMERAL_SILENT_ACK, MUTED, type InboundMessage } from "../src/discord/types.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";
import { useConfiguredModel } from "./fixtures/fake-llm.ts";
import { teamPeopleFile } from "./fixtures/team-people.ts";

// The footer names the configured model (a priced id, so the owner's footer
// can show a cost); the stub agents and fake bins call no model.
useConfiguredModel("gpt-4o-mini");

const OWNER = "111100002222000033";
const ALICE = "200000000000000002";
const BOB = "300000000000000003";
const REPO = resolve(import.meta.dir, "..");

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

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Bun.sleep(1);
}

/** Alive and not a zombie. */
function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const state = stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3);
    return state !== "Z" && state !== "X";
  } catch {
    return false;
  }
}

/** DISCORD-15: `<before> | <time>` (time from the real clock). */
function footer(before: string) {
  const esc = before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return expect.stringMatching(new RegExp(`^${esc} \\| \\d+s$`));
}

type Gate = { input: AgentRunChatOpts; finish: (summary?: string) => void; aborts: number };

/**
 * A stub agent whose runs wait until the test finishes them; an abort ends
 * the run like a killed process (no result frame, exit 137). `abortUsage`
 * is the usage a stopped run had reported so far.
 */
function gatedAgent(opts: { abortUsage?: { promptTokens: number; completionTokens: number; totalTokens: number } } = {}) {
  const runs: Gate[] = [];
  const agent: AgentClient = {
    runChat(input) {
      return new Promise((resolveRun) => {
        const gate: Gate = {
          input,
          aborts: 0,
          finish: (summary) =>
            resolveRun({
              ok: true,
              sessionId: input.sessionId,
              summary: summary ?? `answer to: ${input.humanText?.split("\n")[0]}`,
              exitCode: 0,
            }),
        };
        input.signal?.addEventListener("abort", () => {
          gate.aborts += 1;
          resolveRun({
            ok: false,
            sessionId: input.sessionId,
            summary: "",
            exitCode: 137,
            ...(opts.abortUsage ? { usage: opts.abortUsage } : {}),
          });
        });
        runs.push(gate);
      });
    },
  };
  return { agent, runs };
}

async function bridgeWith(
  agent: AgentClient,
  opts: { db?: ReturnType<typeof openCorvidinhoDb>; allowlistFile?: string } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Array<{ channelId: string; content: string; replyToMessageId?: string }> = [];
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: opts.allowlistFile ?? join(tempDir("corvidinho-stop-"), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    },
    projectRoot: tempDir("corvidinho-stop-proj-"),
    skipProtocolCheck: true,
    disableScheduler: true,
    approvalPollMs: 0,
    ...(opts.db ? { db: opts.db } : {}),
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

function inThread(
  id: string,
  authorId: string,
  content: string,
  opts: { mention?: boolean; replyTo?: string } = {},
): InboundMessage {
  return {
    id,
    channelId: "chan-1",
    threadId: "thr-1",
    authorId,
    authorBot: false,
    content: opts.mention ? `<@999> ${content}` : content,
    mentionedBot: opts.mention === true,
    ...(opts.replyTo ? { referencedMessageId: opts.replyTo } : {}),
  };
}

/** A plain reply in chan-1 (no thread, no @mention). */
function replyInChannel(id: string, authorId: string, content: string, replyTo: string): InboundMessage {
  return { id, channelId: "chan-1", authorId, authorBot: false, content, mentionedBot: false, referencedMessageId: replyTo };
}

/** The progress message's final edit (the collapsed answer). */
function finalEdit(b: Awaited<ReturnType<typeof bridgeWith>>, messageId: string) {
  return b.outbound.contentEdits.filter((e) => e.messageId === messageId && typeof e.content === "string").at(-1);
}

describe("'stop' / 'cancel' stops the run in flight (AGENT-3.a, REQ-discord-302)", () => {
  test("the requester's 'stop' in their thread: the run is aborted once, one short ack, the answer is '⏹ Stopped' with the footer", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", ALICE, "long job", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const progressId = b.outbound.sends[0]!.messageId;

    await b.handlers.onMessage(inThread("s1", ALICE, "stop"));
    await first;
    expect(runs[0]!.aborts).toBe(1);
    expect(runs).toHaveLength(1);
    expect(b.replies).toEqual([{ channelId: "thr-1", content: RUN_STOP_ACK, replyToMessageId: "s1" }]);
    const done = finalEdit(b, progressId)!;
    expect(done.content).toBe(RUN_STOPPED_TEXT);
    // DISCORD-15/15.a: model and time for everyone (not the owner's run: no tokens or cost).
    expect(done.embed).toStrictEqual({ color: THINKING_COLORS.error, footer: { text: footer("gpt-4o-mini") } });
    // The stop is in the session's thread; the stopped run's answer too.
    const session = b.result.store.getByThread("thr-1", ALICE)!;
    const turns = b.result.store.threadFor(session).map((t) => t.content);
    expect(turns).toContain(RUN_STOPPED_TEXT);
    expect(turns).not.toContain("stop");
    await b.result.stop();
  });

  test("the owner's own stopped run shows tokens and cost in its footer (DISCORD-15.a)", async () => {
    const { agent, runs } = gatedAgent({ abortUsage: { promptTokens: 1000, completionTokens: 1000, totalTokens: 2000 } });
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", OWNER, "long job", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    await b.handlers.onMessage(inThread("s1", OWNER, "Cancel!"));
    await first;
    const done = finalEdit(b, b.outbound.sends[0]!.messageId)!;
    expect(done.content).toBe(RUN_STOPPED_TEXT);
    expect((done.embed as { footer: { text: string } }).footer.text).toMatch(/^gpt-4o-mini \| 2k tokens \| \$0\.\d+ \| \d+s$/);
    await b.result.stop();
  });

  test("'cancel' as a reply to the running progress message stops it (the progress message is not a session message)", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: ALICE,
      authorBot: false,
      content: "<@999> long job",
      mentionedBot: true,
    });
    expect(await until(() => runs.length === 1)).toBe(true);
    const progressId = b.outbound.sends[0]!.messageId;
    await b.handlers.onMessage(replyInChannel("s1", ALICE, "cancel", progressId));
    await first;
    expect(runs[0]!.aborts).toBe(1);
    expect(b.replies.map((r) => r.content)).toEqual([RUN_STOP_ACK]);
    expect(finalEdit(b, progressId)!.content).toBe(RUN_STOPPED_TEXT);
    await b.result.stop();
  });

  test("the owner's 'stop' in reply to someone else's running progress message stops it; anyone else's does not", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: ALICE,
      authorBot: false,
      content: "<@999> long job",
      mentionedBot: true,
    });
    expect(await until(() => runs.length === 1)).toBe(true);
    const progressId = b.outbound.sends[0]!.messageId;
    // Bob is neither the requester nor the owner: his reply is ordinary chat
    // (no @mention ⇒ ignored) and the run goes on.
    await b.handlers.onMessage(replyInChannel("x1", BOB, "stop", progressId));
    await settle();
    expect(runs[0]!.aborts).toBe(0);
    expect(b.replies).toEqual([]);
    // The owner's reply stops it.
    await b.handlers.onMessage(replyInChannel("s1", OWNER, "stop", progressId));
    await first;
    expect(runs[0]!.aborts).toBe(1);
    expect(b.replies).toEqual([{ channelId: "chan-1", content: RUN_STOP_ACK, replyToMessageId: "s1" }]);
    expect(finalEdit(b, progressId)!.content).toBe(RUN_STOPPED_TEXT);
    // The owner's stop never became a session of theirs.
    expect(b.result.store.list().map((s) => s.userId)).toEqual([ALICE]);
    await b.result.stop();
  });

  test("a second 'stop' while it is stopping aborts nothing more: one abort, one '⏹ Stopped'", async () => {
    const runs: Array<{ aborts: number; release?: () => void }> = [];
    // An agent that takes a moment to wind down after the abort, as a killed tree does.
    const agent: AgentClient = {
      runChat(input) {
        return new Promise((resolveRun) => {
          const r = { aborts: 0 };
          runs.push(r);
          input.signal?.addEventListener("abort", () => {
            r.aborts += 1;
            setTimeout(() => resolveRun({ ok: false, sessionId: input.sessionId, summary: "", exitCode: 137 }), 50);
          });
        });
      },
    };
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", ALICE, "long job", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    await b.handlers.onMessage(inThread("s1", ALICE, "stop"));
    await b.handlers.onMessage(inThread("s2", ALICE, "stop"));
    await first;
    await settle();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.aborts).toBe(1);
    const stoppedEdits = b.outbound.contentEdits.filter((e) => e.content === RUN_STOPPED_TEXT);
    expect(stoppedEdits).toHaveLength(1);
    expect(b.replies.map((r) => r.replyToMessageId)).toEqual(["s1", "s2"]);
    await b.result.stop();
  });

  test("messages that were waiting still run after a stop, in order (AGENT-3.b)", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const all = [b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }))];
    expect(await until(() => runs.length === 1)).toBe(true);
    all.push(b.handlers.onMessage(inThread("m2", ALICE, "two")));
    all.push(b.handlers.onMessage(inThread("m3", ALICE, "three")));
    await settle();
    expect(runs).toHaveLength(1);
    // The stop reaches the run in flight at once; it never waits in the queue.
    await b.handlers.onMessage(inThread("s1", ALICE, "stop"));
    expect(runs[0]!.aborts).toBe(1);
    expect(await until(() => runs.length === 2)).toBe(true);
    expect(runs[1]!.input.humanText).toBe("two");
    runs[1]!.finish();
    expect(await until(() => runs.length === 3)).toBe(true);
    expect(runs[2]!.input.humanText).toBe("three");
    runs[2]!.finish();
    await Promise.all(all);
    expect(runs[1]!.aborts + runs[2]!.aborts).toBe(0);
    const bodies = b.outbound.contentEdits.map((e) => e.content).filter((c) => typeof c === "string");
    expect(bodies).toEqual([RUN_STOPPED_TEXT, "answer to: two", "answer to: three"]);
    await b.result.stop();
  });

  test("with nothing running 'cancel' still clears an open ask and 'stop' goes to the agent as before", async () => {
    const calls: AgentRunChatOpts[] = [];
    const agent: AgentClient = {
      async runChat(input) {
        calls.push(input);
        return calls.length === 1
          ? { ok: true, sessionId: input.sessionId, summary: "Q", exitCode: 0, ask: { reason: "clarify", question: "Which DB?" } }
          : { ok: true, sessionId: input.sessionId, summary: "plain", exitCode: 0 };
      },
    };
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(inThread("m1", ALICE, "set up a db", { mention: true }));
    expect(b.result.store.getByThread("thr-1", ALICE)!.pendingAsk).toBeTruthy();
    await b.handlers.onMessage(inThread("c1", ALICE, "cancel"));
    expect(calls).toHaveLength(1);
    expect(b.replies.at(-1)!.content).toBe(ASK_CANCELLED_ACK);
    expect(b.result.store.getByThread("thr-1", ALICE)!.pendingAsk ?? null).toBeNull();
    await b.handlers.onMessage(inThread("s1", ALICE, "stop"));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.humanText).toBe("stop");
    expect(b.replies.map((r) => r.content)).not.toContain(RUN_STOP_ACK);
    await b.result.stop();
  });

  test("'cancel' while a run is going stops it and leaves the session's open button ask open (REQ-discord-044)", async () => {
    const { agent: gated, runs } = gatedAgent();
    let first = true;
    const agent: AgentClient = {
      runChat(input) {
        if (first) {
          first = false;
          return Promise.resolve({
            ok: true,
            sessionId: input.sessionId,
            summary: "Pick",
            exitCode: 0,
            ask: { reason: "clarify", question: "Which?", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
          });
        }
        return gated.runChat(input);
      },
    };
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(inThread("m1", ALICE, "choose", { mention: true }));
    const askId = b.result.store.getByThread("thr-1", ALICE)!.pendingAsk!.askId;
    // Chat goes on while the button ask is open; that run is going …
    const second = b.handlers.onMessage(inThread("m2", ALICE, "meanwhile, this"));
    expect(await until(() => runs.length === 1)).toBe(true);
    // … and 'cancel' stops it instead of clearing the ask.
    const before = b.replies.length;
    await b.handlers.onMessage(inThread("c1", ALICE, "cancel"));
    await second;
    expect(runs[0]!.aborts).toBe(1);
    expect(b.replies.slice(before).map((r) => r.content)).toEqual([RUN_STOP_ACK]);
    expect(b.replies.map((r) => r.content)).not.toContain(ASK_CANCELLED_ACK);
    expect(b.result.store.getByThread("thr-1", ALICE)!.pendingAsk?.askId).toBe(askId);
    await b.result.stop();
  });

  test("a pick's resumed run stops by a 'stop' reply to its stub (checked before the stub's session lookup)", async () => {
    const { agent: gated, runs } = gatedAgent();
    let first = true;
    const agent: AgentClient = {
      runChat(input) {
        if (first) {
          first = false;
          return Promise.resolve({
            ok: true,
            sessionId: input.sessionId,
            summary: "Pick",
            exitCode: 0,
            ask: { reason: "clarify", question: "Which?", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
          });
        }
        return gated.runChat(input);
      },
    };
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(inThread("m1", ALICE, "choose", { mention: true }));
    const session = b.result.store.getByThread("thr-1", ALICE)!;
    const stubId = session.pendingAsk!.stubMessageId!;
    expect(stubId).toBeTruthy();
    const pick = b.handlers.onComponent!({
      id: "ix1",
      customId: pickCustomId(session.pendingAsk!.askId, "a"),
      channelId: "thr-1",
      userId: ALICE,
      messageId: stubId,
      reply: async () => {},
      deleteReply: async () => {},
    });
    expect(await until(() => runs.length === 1)).toBe(true);
    await b.handlers.onMessage(inThread("s1", ALICE, "stop", { replyTo: stubId }));
    await pick;
    expect(runs[0]!.aborts).toBe(1);
    expect(finalEdit(b, stubId)!.content).toBe(RUN_STOPPED_TEXT);
    await b.result.stop();
  });

  test("/session start and /work stop by a 'stop' reply to their progress message; a stopped /work is failed and opens no PR", async () => {
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
      const progressId = b.outbound.sends[0]!.messageId;
      await b.handlers.onMessage(replyInChannel(`s_${command}`, ALICE, "stop", progressId));
      await slash;
      expect({ command, aborts: runs[0]!.aborts }).toEqual({ command, aborts: 1 });
      const done = finalEdit(b, progressId)!;
      expect(done.content).toContain(RUN_STOPPED_TEXT);
      expect(done.content).not.toContain("failed (exit");
      if (command === "work") {
        expect(done.content).toContain("PR: not opened — the run was stopped.");
        expect(b.result.workStore.list()[0]).toMatchObject({ status: "failed", summary: "stopped" });
      }
      await b.result.stop();
    }
  });
});

describe("a stop after the /work agent exited, before its PR step (AGENT-3)", () => {
  test("opens no PR: the task is failed / stopped and the PR line says the run was stopped", async () => {
    let releaseDm!: () => void;
    const dmGate = new Promise<void>((r) => (releaseDm = r));
    let dmStarted = false;
    const agent: AgentClient = {
      async runChat(input) {
        return {
          ok: true,
          sessionId: input.sessionId,
          summary: "done",
          exitCode: 0,
          privateReplies: ["just for you"],
        };
      },
    };
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const outbound = memoryThinkingOutbound();
    const replies: Array<{ channelId: string; content: string; replyToMessageId?: string }> = [];
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: teamPeopleFile(ALICE),
        CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      },
      projectRoot: tempDir("corvidinho-stop-proj-"),
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
        // The private reply's DM holds the /work turn after its agent exited.
        handlers.sendDm = async () => {
          dmStarted = true;
          await dmGate;
          return { channelId: "dm-chan", messageId: "dm_1" };
        };
        return createNullGateway();
      },
    });
    if (!result.ok || !box.handlers) throw new Error("bridge did not start");
    const ix: SlashInteraction = {
      id: "ix_work",
      commandName: "work",
      channelId: "chan-1",
      userId: ALICE,
      options: { description: "do it" },
      reply: async () => {},
      deferReply: async () => {},
      editReply: async () => {},
      deleteReply: async () => {},
    };
    const slash = box.handlers.onSlash!(ix);
    expect(await until(() => dmStarted)).toBe(true);
    const progressId = outbound.sends[0]!.messageId;
    await box.handlers.onMessage(replyInChannel("s_late", ALICE, "stop", progressId));
    expect(replies.map((r) => r.content)).toEqual([RUN_STOP_ACK]);
    releaseDm();
    await slash;
    const done = outbound.contentEdits.filter((e) => e.messageId === progressId && typeof e.content === "string").at(-1)!;
    expect(done.content).toContain("PR: not opened — the run was stopped.");
    expect(result.workStore.list()[0]).toMatchObject({ status: "failed", summary: "stopped" });
    await result.stop();
  });
});

describe("a stop kills the run's process tree; an Approve card it waited on closes as a no (AGENT-3, SAFE-20)", () => {
  test("the spawned agent and what it started are killed", async () => {
    const dir = tempDir("corvidinho-stop-tree-");
    const bin = join(dir, "corvidinho");
    writeFileSync(
      bin,
      ["#!/bin/sh", `echo $$ > "${dir}/run.pid"`, `sleep 60 & echo $! > "${dir}/bg.pid"`, "wait", ""].join("\n"),
      { mode: 0o755 },
    );
    const b = await bridgeWith(createSpawnAgentClient({ bin, cwd: dir }));
    const pidIn = (f: string) => {
      try {
        return Number(readFileSync(join(dir, f), "utf8").trim()) || 0;
      } catch {
        return 0;
      }
    };
    const first = b.handlers.onMessage(inThread("m1", ALICE, "long job", { mention: true }));
    expect(await until(() => pidIn("run.pid") > 0 && pidIn("bg.pid") > 0, 10_000)).toBe(true);
    const agentPid = pidIn("run.pid");
    const bgPid = pidIn("bg.pid");
    expect(running(agentPid) && running(bgPid)).toBe(true);
    await b.handlers.onMessage(inThread("s1", ALICE, "stop"));
    await first;
    expect(await until(() => !running(agentPid) && !running(bgPid))).toBe(true);
    expect(finalEdit(b, b.outbound.sends[0]!.messageId)!.content).toBe(RUN_STOPPED_TEXT);
    await b.result.stop();
  });

  test("a run waiting on an Approve card is killed and the card closes as a no", async () => {
    const dir = tempDir("corvidinho-stop-card-");
    const dbPath = join(dir, "corvidinho.db");
    const db = openCorvidinhoDb({ path: dbPath });
    const mark = join(dir, "card.id");
    // A fake agent that raises a must-ask card the way src/plugins/must-ask.ts
    // does (itself as the waiting process) and waits for the answer.
    const bin = join(dir, "fake-agent.ts");
    writeFileSync(
      bin,
      [
        `import { writeFileSync } from "node:fs";`,
        `import { ApprovalStore } from ${JSON.stringify(join(REPO, "src/approvals/store.ts"))};`,
        `import { scheduleRunnerId } from ${JSON.stringify(join(REPO, "src/scheduler/store.ts"))};`,
        `import { openCorvidinhoDb } from ${JSON.stringify(join(REPO, "src/store/db.ts"))};`,
        `const db = openCorvidinhoDb({ path: process.env.STOP_TEST_DB! });`,
        `const req = new ApprovalStore({ db }).request({ kind: "mustask", class: "destructive", title: "Prod", action: "kubectl get pods", target: "prod", amount: "none", requester: "${ALICE}", waiter: scheduleRunnerId(), ttlMs: 60_000 });`,
        `writeFileSync(process.env.STOP_TEST_MARK!, req.id);`,
        `await Bun.sleep(60_000);`,
        ``,
      ].join("\n"),
    );
    const client = createSpawnAgentClient({
      bin,
      cwd: dir,
      env: { STOP_TEST_DB: dbPath, STOP_TEST_MARK: mark },
    });
    const b = await bridgeWith(client, { db });
    const first = b.handlers.onMessage(inThread("m1", ALICE, "deploy check", { mention: true }));
    expect(await until(() => existsSync(mark), 15_000)).toBe(true);
    const id = readFileSync(mark, "utf8").trim();
    const store = new ApprovalStore({ db });
    expect(store.get(id)!.status).toBe("pending");
    await b.handlers.onMessage(inThread("s1", ALICE, "stop"));
    await first;
    // The stopped turn runs a card pass: nobody waits for the card now ⇒ no.
    expect(await until(() => store.get(id)!.status === "expired")).toBe(true);
    expect(finalEdit(b, b.outbound.sends[0]!.messageId)!.content).toBe(RUN_STOPPED_TEXT);
    await b.result.stop();
  }, 30_000);
});

describe("the stop_run route and the stop words (REQ-discord-302)", () => {
  test("isStopRunText: only 'stop' or 'cancel' as the whole message", () => {
    for (const t of ["stop", "Stop", " STOP. ", "cancel", "Cancel!", "stop!!"]) expect({ t, v: isStopRunText(t) }).toEqual({ t, v: true });
    for (const t of ["stop it", "please stop", "cancel that", "stopped", "", "nevermind", "don't stop"]) {
      expect({ t, v: isStopRunText(t) }).toEqual({ t, v: false });
    }
  });

  function routerDeps(runs: SessionRunControl) {
    const allowlist = emptyConfig();
    allowlist.discord.channels.push("chan-1");
    const store = new SessionStore({ ttlMs: 60_000 });
    const deps: RouterDeps = { store, allowlist, channelOnlyGate: true, owner: { discordId: OWNER }, runs };
    return { store, deps, allowlist };
  }

  test("a reply 'stop' to a running progress message routes to stop_run before the bot-message lookup, in its own channel only", async () => {
    const runs = new SessionRunControl();
    const { store, deps, allowlist } = routerDeps(runs);
    allowlist.discord.channels.push("chan-2");
    const session = store.create({ channelId: "chan-1", userId: ALICE });
    const turn = runs.enqueue({ sessionId: session.id, requesterId: ALICE, channelId: "chan-1" });
    expect(await turn.ready).toBe(true);
    turn.setProgressMessage("prog-1");
    // The progress message is also a tracked bot message (a pick's stub is).
    store.trackBotMessage("prog-1", session);
    const reply = (authorId: string, content: string, channelId = "chan-1") =>
      routeMessage(
        { id: "x", channelId, authorId, authorBot: false, content, mentionedBot: false, referencedMessageId: "prog-1" },
        deps,
      );
    expect(reply(ALICE, "stop")).toEqual({ kind: "stop_run", runId: turn.runId, sessionId: session.id });
    expect(reply(OWNER, "<@999> cancel")).toEqual({ kind: "stop_run", runId: turn.runId, sessionId: session.id });
    // Other text, or someone else: routed as before (the requester continues).
    expect(reply(ALICE, "stop it").kind).toBe("continue_session");
    expect(reply(BOB, "stop").kind).not.toBe("stop_run");
    // Only in the progress message's own channel.
    expect(reply(ALICE, "stop", "chan-2").kind).not.toBe("stop_run");
    // Once the run is done its progress message stops nothing.
    turn.done();
    expect(reply(ALICE, "stop").kind).toBe("continue_session");
  });

  test("the stop_run route passes the actor gate: a deny-listed requester is refused quietly", async () => {
    const runs = new SessionRunControl();
    const { store, deps, allowlist } = routerDeps(runs);
    allowlist.discord.denyUsers.push(ALICE);
    const session = store.create({ channelId: "chan-1", userId: ALICE });
    const turn = runs.enqueue({ sessionId: session.id, requesterId: ALICE, channelId: "chan-1" });
    expect(await turn.ready).toBe(true);
    turn.setProgressMessage("prog-1");
    const action = routeMessage(
      { id: "x", channelId: "chan-1", authorId: ALICE, authorBot: false, content: "stop", mentionedBot: false, referencedMessageId: "prog-1" },
      deps,
    );
    expect(action).toEqual({ kind: "refuse", reason: "user_not_allowlisted" });
    turn.done();
  });
});

type PressReply = Parameters<ComponentInteraction["reply"]>[0];

/** The Stop button's custom id on a progress message's components. */
function stopIdOf(components: unknown): string {
  const rows = components as Array<{ components: Array<{ custom_id: string }> }>;
  return rows[0]!.components[0]!.custom_id;
}

/** One red **Stop** button, `cvstop:run_<n>`, alone on its row. */
const STOP_ROW = [
  {
    type: 1,
    components: [{ type: 2, style: 4, label: "Stop", custom_id: expect.stringMatching(/^cvstop:run_\d+$/) }],
  },
];

let pressSeq = 0;
/** Press a button (or submit a form, with `modalValues`) and collect its replies. */
async function press(
  b: { handlers: GatewayHandlers },
  opts: { customId: string; userId: string; messageId?: string; channelId: string; modalValues?: Record<string, string> },
): Promise<PressReply[]> {
  const replies: PressReply[] = [];
  pressSeq += 1;
  await b.handlers.onComponent!({
    id: `ixs_${pressSeq}`,
    customId: opts.customId,
    channelId: opts.channelId,
    userId: opts.userId,
    ...(opts.messageId ? { messageId: opts.messageId } : {}),
    ...(opts.modalValues ? { modalValues: opts.modalValues } : {}),
    reply: async (o) => {
      replies.push(o);
    },
    deleteReply: async () => {},
  });
  return replies;
}

describe("the Stop button on a run's progress message (AGENT-3.a, REQ-discord-303)", () => {
  test("a chat run's progress message carries one red Stop button; the requester's press stops the run once, acks privately, and '⏹ Stopped' clears the button", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", ALICE, "long job", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const sent = b.outbound.sends[0]!;
    expect(sent.components).toEqual(STOP_ROW);
    const stopId = stopIdOf(sent.components);
    // Working edits leave the button alone.
    expect(b.outbound.edits.filter((e) => e.messageId === sent.messageId).every((e) => e.components === undefined)).toBe(true);

    const acks = await press(b, { customId: stopId, userId: ALICE, messageId: sent.messageId, channelId: "thr-1" });
    await first;
    expect(acks).toEqual([{ content: RUN_STOP_ACK, ephemeral: true }]);
    expect(runs[0]!.aborts).toBe(1);
    expect(runs).toHaveLength(1);
    // Nothing public besides the stopped answer.
    expect(b.replies).toEqual([]);
    const done = finalEdit(b, sent.messageId)!;
    expect(done.content).toBe(RUN_STOPPED_TEXT);
    expect(done.components).toBeNull();
    expect(done.embed).toStrictEqual({ color: THINKING_COLORS.error, footer: { text: footer("gpt-4o-mini") } });
    // The stopped run's answer is in the thread; the press added nothing.
    const session = b.result.store.getByThread("thr-1", ALICE)!;
    const turns = b.result.store.threadFor(session).map((t) => t.content);
    expect(turns.filter((t) => t === RUN_STOPPED_TEXT)).toHaveLength(1);
    expect(turns).toHaveLength(2);
    // Once it is stopped the button stops nothing.
    expect(await press(b, { customId: stopId, userId: ALICE, messageId: sent.messageId, channelId: "thr-1" })).toEqual([
      { content: RUN_STOP_NOTHING_RUNNING, ephemeral: true },
    ]);
    await b.result.stop();
  });

  test("the owner's press stops someone else's run; anyone else gets 'This Stop button isn't for you.' and the run goes on", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage({
      id: "m1",
      channelId: "chan-1",
      authorId: ALICE,
      authorBot: false,
      content: "<@999> long job",
      mentionedBot: true,
    });
    expect(await until(() => runs.length === 1)).toBe(true);
    const sent = b.outbound.sends[0]!;
    const stopId = stopIdOf(sent.components);
    expect(await press(b, { customId: stopId, userId: BOB, messageId: sent.messageId, channelId: "chan-1" })).toEqual([
      { content: RUN_STOP_NOT_YOURS, ephemeral: true },
    ]);
    await settle();
    expect(runs[0]!.aborts).toBe(0);
    expect(await press(b, { customId: stopId, userId: OWNER, messageId: sent.messageId, channelId: "chan-1" })).toEqual([
      { content: RUN_STOP_ACK, ephemeral: true },
    ]);
    await first;
    expect(runs[0]!.aborts).toBe(1);
    expect(finalEdit(b, sent.messageId)!.content).toBe(RUN_STOPPED_TEXT);
    // The owner's press started no session of theirs.
    expect(b.result.store.list().map((s) => s.userId)).toEqual([ALICE]);
    await b.result.stop();
  });

  test("a finished run's button is cleared with its answer, and a stale or mismatched button gets 'Nothing is running.' and stops nothing", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const old = b.outbound.sends[0]!;
    runs[0]!.finish();
    await first;
    // Cleared on done: the collapsed answer carries no button.
    const answer = finalEdit(b, old.messageId)!;
    expect(answer.content).toBe("answer to: one");
    expect(answer.components).toBeNull();

    const second = b.handlers.onMessage(inThread("m2", ALICE, "two"));
    expect(await until(() => runs.length === 2)).toBe(true);
    const live = b.outbound.sends[1]!;
    expect(stopIdOf(live.components)).not.toBe(stopIdOf(old.components));
    const nothing = [{ content: RUN_STOP_NOTHING_RUNNING, ephemeral: true }];
    // The finished run's own button.
    expect(await press(b, { customId: stopIdOf(old.components), userId: ALICE, messageId: old.messageId, channelId: "thr-1" })).toEqual(nothing);
    // The live run's id on another message, another run's id on the live message.
    expect(await press(b, { customId: stopIdOf(live.components), userId: ALICE, messageId: old.messageId, channelId: "thr-1" })).toEqual(nothing);
    expect(await press(b, { customId: stopIdOf(old.components), userId: ALICE, messageId: live.messageId, channelId: "thr-1" })).toEqual(nothing);
    // The live run's button pressed in another allowlisted channel.
    b.result.config.allowlist.discord.channels.push("chan-2");
    expect(await press(b, { customId: stopIdOf(live.components), userId: ALICE, messageId: live.messageId, channelId: "chan-2" })).toEqual(nothing);
    // A button from before a restart names no running run here (in the
    // allowlisted channel; in a thread no session is known for, the quiet
    // channel-gate ack).
    expect(await press(b, { customId: stopRunCustomId("run_99"), userId: ALICE, messageId: "progress_old", channelId: "chan-1" })).toEqual(nothing);
    expect(await press(b, { customId: stopRunCustomId("run_99"), userId: ALICE, messageId: "progress_old", channelId: "thr-9" })).toEqual([
      { content: EPHEMERAL_SILENT_ACK, ephemeral: true },
    ]);
    await settle();
    expect(runs[1]!.aborts).toBe(0);
    runs[1]!.finish();
    await second;
    expect(finalEdit(b, live.messageId)!.components).toBeNull();
    await b.result.stop();
  });

  test("a failed run's answer clears the button too, and so does the failure status when the run throws", async () => {
    let n = 0;
    const agent: AgentClient = {
      async runChat(input) {
        n += 1;
        if (n === 1) return { ok: false, sessionId: input.sessionId, summary: "", exitCode: 1 };
        throw new Error("spawn failed");
      },
    };
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }));
    const failed = b.outbound.sends[0]!;
    expect(failed.components).toEqual(STOP_ROW);
    expect(finalEdit(b, failed.messageId)!.components).toBeNull();
    await expect(b.handlers.onMessage(inThread("m2", ALICE, "two"))).rejects.toThrow("spawn failed");
    const thrown = b.outbound.sends[1]!;
    expect(thrown.components).toEqual(STOP_ROW);
    const last = b.outbound.edits.filter((e) => e.messageId === thrown.messageId).at(-1)!;
    expect((last.embed as { description: string }).description).toBe("❌ spawn failed");
    expect(last.components).toBeNull();
    await b.result.stop();
  });

  test("a press passes the channel, actor and mute gates first: off the allowlist, deny-listed or muted, it stops nothing", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", ALICE, "long job", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const sent = b.outbound.sends[0]!;
    const at = { customId: stopIdOf(sent.components), messageId: sent.messageId, channelId: "thr-1" };
    const deny = b.result.config.allowlist.discord;

    // The run's thread deny-listed: zero-width for the requester, the tip for the owner.
    deny.denyChannels.push("thr-1");
    expect(await press(b, { ...at, userId: ALICE })).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
    expect(await press(b, { ...at, userId: OWNER })).toEqual([{ content: ALLOWLIST_DENY_TIP, ephemeral: true }]);
    deny.denyChannels.pop();
    // The requester deny-listed: zero-width.
    deny.denyUsers.push(ALICE);
    expect(await press(b, { ...at, userId: ALICE })).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
    deny.denyUsers.pop();
    // The requester muted: the mute reply.
    b.result.muteUser(ALICE);
    expect(await press(b, { ...at, userId: ALICE })).toEqual([{ content: MUTED, ephemeral: true }]);
    b.result.unmuteUser(ALICE);
    await settle();
    expect(runs[0]!.aborts).toBe(0);

    // A forged form submit with a Stop id is ignored (no reply, no stop).
    expect(await press(b, { ...at, userId: ALICE, modalValues: { answer: "x" } })).toEqual([]);
    expect(runs[0]!.aborts).toBe(0);

    // Past the gates, the press stops it; a second press while it winds down aborts nothing more.
    expect(await press(b, { ...at, userId: ALICE })).toEqual([{ content: RUN_STOP_ACK, ephemeral: true }]);
    await first;
    expect(runs[0]!.aborts).toBe(1);
    await b.result.stop();
  });

  test("a second press (or a 'stop' reply) while the run winds down gets the same ack and aborts nothing more", async () => {
    const runs: Array<{ aborts: number }> = [];
    const agent: AgentClient = {
      runChat(input) {
        return new Promise((resolveRun) => {
          const r = { aborts: 0 };
          runs.push(r);
          input.signal?.addEventListener("abort", () => {
            r.aborts += 1;
            setTimeout(() => resolveRun({ ok: false, sessionId: input.sessionId, summary: "", exitCode: 137 }), 50);
          });
        });
      },
    };
    const b = await bridgeWith(agent);
    const first = b.handlers.onMessage(inThread("m1", ALICE, "long job", { mention: true }));
    expect(await until(() => runs.length === 1)).toBe(true);
    const sent = b.outbound.sends[0]!;
    const at = { customId: stopIdOf(sent.components), messageId: sent.messageId, channelId: "thr-1" };
    const ack = [{ content: RUN_STOP_ACK, ephemeral: true }];
    expect(await press(b, { ...at, userId: ALICE })).toEqual(ack);
    expect(await press(b, { ...at, userId: OWNER })).toEqual(ack);
    // The stop words take the same stop (REQ-discord-302): a 'stop' reply to
    // the same progress message aborts nothing more and gets its ack.
    await b.handlers.onMessage(inThread("s1", ALICE, "stop", { replyTo: sent.messageId }));
    await first;
    expect(runs[0]!.aborts).toBe(1);
    expect(b.replies).toEqual([{ channelId: "thr-1", content: RUN_STOP_ACK, replyToMessageId: "s1" }]);
    expect(b.outbound.contentEdits.filter((e) => e.content === RUN_STOPPED_TEXT)).toHaveLength(1);
    await b.result.stop();
  });

  test("after a Stop press, messages that were waiting still run, in order, each with its own button (AGENT-3.b)", async () => {
    const { agent, runs } = gatedAgent();
    const b = await bridgeWith(agent);
    const all = [b.handlers.onMessage(inThread("m1", ALICE, "one", { mention: true }))];
    expect(await until(() => runs.length === 1)).toBe(true);
    all.push(b.handlers.onMessage(inThread("m2", ALICE, "two")));
    all.push(b.handlers.onMessage(inThread("m3", ALICE, "three")));
    await settle();
    // Waiting messages get no progress message (and no button) yet.
    expect(b.outbound.sends).toHaveLength(1);
    const sent = b.outbound.sends[0]!;
    expect(await press(b, { customId: stopIdOf(sent.components), userId: ALICE, messageId: sent.messageId, channelId: "thr-1" })).toEqual([
      { content: RUN_STOP_ACK, ephemeral: true },
    ]);
    expect(runs[0]!.aborts).toBe(1);
    expect(await until(() => runs.length === 2)).toBe(true);
    expect(runs[1]!.input.humanText).toBe("two");
    runs[1]!.finish();
    expect(await until(() => runs.length === 3)).toBe(true);
    expect(runs[2]!.input.humanText).toBe("three");
    runs[2]!.finish();
    await Promise.all(all);
    expect(runs[1]!.aborts + runs[2]!.aborts).toBe(0);
    const ids = b.outbound.sends.map((x) => stopIdOf(x.components));
    expect(new Set(ids).size).toBe(3);
    const bodies = b.outbound.contentEdits.map((e) => e.content).filter((c) => typeof c === "string");
    expect(bodies).toEqual([RUN_STOPPED_TEXT, "answer to: two", "answer to: three"]);
    for (const x of b.outbound.sends) expect(finalEdit(b, x.messageId)!.components).toBeNull();
    await b.result.stop();
  });

  test("a pick's resumed run: the Stop button takes the Choose button's place on the stub, and pressing it stops the run", async () => {
    const { agent: gated, runs } = gatedAgent();
    let first = true;
    const agent: AgentClient = {
      runChat(input) {
        if (first) {
          first = false;
          return Promise.resolve({
            ok: true,
            sessionId: input.sessionId,
            summary: "Pick",
            exitCode: 0,
            ask: { reason: "clarify", question: "Which?", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
          });
        }
        return gated.runChat(input);
      },
    };
    const b = await bridgeWith(agent);
    await b.handlers.onMessage(inThread("m1", ALICE, "choose", { mention: true }));
    const session = b.result.store.getByThread("thr-1", ALICE)!;
    const stubId = session.pendingAsk!.stubMessageId!;
    const pick = b.handlers.onComponent!({
      id: "ix1",
      customId: pickCustomId(session.pendingAsk!.askId, "a"),
      channelId: "thr-1",
      userId: ALICE,
      messageId: stubId,
      reply: async () => {},
      deleteReply: async () => {},
    });
    expect(await until(() => runs.length === 1)).toBe(true);
    const onStub = b.outbound.contentEdits.filter((e) => e.messageId === stubId).at(-1)!;
    expect(onStub.content).toBeNull();
    expect(onStub.components).toEqual(STOP_ROW);
    expect(await press(b, { customId: stopIdOf(onStub.components), userId: ALICE, messageId: stubId, channelId: "thr-1" })).toEqual([
      { content: RUN_STOP_ACK, ephemeral: true },
    ]);
    await pick;
    expect(runs[0]!.aborts).toBe(1);
    const done = finalEdit(b, stubId)!;
    expect(done.content).toBe(RUN_STOPPED_TEXT);
    expect(done.components).toBeNull();
    await b.result.stop();
  });

  test("/session start and /work: their progress message carries the button and a press stops the run; a stopped /work opens no PR", async () => {
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
      const sent = b.outbound.sends[0]!;
      expect({ command, components: sent.components }).toEqual({ command, components: STOP_ROW });
      expect(
        await press(b, { customId: stopIdOf(sent.components), userId: ALICE, messageId: sent.messageId, channelId: "chan-1" }),
      ).toEqual([{ content: RUN_STOP_ACK, ephemeral: true }]);
      await slash;
      expect({ command, aborts: runs[0]!.aborts }).toEqual({ command, aborts: 1 });
      const done = finalEdit(b, sent.messageId)!;
      expect(done.content).toContain(RUN_STOPPED_TEXT);
      expect(done.components).toBeNull();
      if (command === "work") {
        expect(done.content).toContain("PR: not opened — the run was stopped.");
        expect(b.result.workStore.list()[0]).toMatchObject({ status: "failed", summary: "stopped" });
      }
      await b.result.stop();
    }
  });

  test("a restart's interrupted notice clears the dead run's Stop button", async () => {
    const dir = tempDir("corvidinho-stop-recover-");
    const db = openCorvidinhoDb({ path: join(dir, "corvidinho.db") });
    const inflight = new InflightReplyStore(db);
    const row = inflight.begin({ sessionId: "sess_1", channelId: "chan-1", requestMessageId: "m1" });
    inflight.setProgressMessage(row.id, "progress_1");
    const edits: Array<{ messageId: string; components?: unknown[] | null }> = [];
    const r = await recoverInterruptedReplies({
      store: inflight,
      rows: inflight.list(),
      editEmbed: async (o) => {
        edits.push({ messageId: o.messageId, components: o.components });
        return true;
      },
    });
    expect(r.edited).toBe(1);
    expect(edits).toEqual([{ messageId: "progress_1", components: null }]);
    db.close();
  });
});

describe("the Stop button's custom id (REQ-discord-303)", () => {
  test("cvstop:<runId> round-trips; other prefixes, card and ask ids, and malformed ids parse as null", () => {
    expect(stopRunCustomId("run_7")).toBe("cvstop:run_7");
    expect(parseStopRunCustomId("cvstop:run_7")).toBe("run_7");
    expect(buildStopComponents("run_7")).toEqual([
      { type: 1, components: [{ type: 2, style: 4, label: "Stop", custom_id: "cvstop:run_7" }] },
    ]);
    for (const raw of [
      "cvstop-schedule:run_7",
      "cvstop:run_7:x",
      "cvstop:",
      "cvstop:7",
      "cvstop:run_x",
      "cvstop",
      openCustomId("abc123"),
      answerCustomId("abc123"),
      approveCardCustomId("spend", "approve", "req_1"),
    ]) {
      expect({ raw, v: parseStopRunCustomId(raw) }).toEqual({ raw, v: null });
    }
    expect(() => stopRunCustomId("run_7:x")).toThrow();
  });
});
