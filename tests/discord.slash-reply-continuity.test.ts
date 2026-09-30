/**
 * DISCORD-2 / SESSION-MULTI-1 (REQ-discord-002) — replying to a /session start
 * or /work answer continues THAT session, with or without the reply ping, and
 * another user's reply never hijacks it.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import type {
  AgentClient,
  AgentRunChatOpts,
} from "../src/discord/agent-client.ts";
import {
  createNullGateway,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import type {
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import type { ThinkingOutbound } from "../src/discord/thinking-status.ts";
import { teamPeopleFile } from "./fixtures/team-people.ts";

/** Missing allowlist file: never read the operator's allowlist (ALLOW-4). */
const NO_ALLOWLIST = join(
  mkdtempSync(join(tmpdir(), "corvidinho-slash-reply-")),
  "no-allowlist.toml",
);
const CHAN = "chan-1";
const OWNER = "100000000000000001";
const OTHER = "100000000000000002";

/** Bridges started by a test; stopped after it even when an expect fails. */
const running: Array<{ stop: () => Promise<void> }> = [];
afterEach(async () => {
  for (const r of running.splice(0)) await r.stop();
});

type Call = Pick<AgentRunChatOpts, "sessionId" | "resume" | "actingUserId"> & {
  humanText?: string;
};

function recordingAgent(calls: Call[]): AgentClient {
  return {
    async runChat(opts) {
      calls.push({
        sessionId: opts.sessionId,
        resume: opts.resume,
        actingUserId: opts.actingUserId,
        humanText: opts.humanText,
      });
      return {
        ok: true,
        sessionId: opts.sessionId,
        summary: `answer for ${opts.humanText ?? ""}`,
        exitCode: 0,
      };
    },
  };
}

/** Slash fake: editReply resolves with the deferred reply's message id. */
function slash(opts: {
  n: number;
  command: "session" | "work";
  userId: string;
  text: string;
}): SlashInteraction & { edits: SlashReplyPayload[]; deleted: number[] } {
  const edits: SlashReplyPayload[] = [];
  const deleted: number[] = [];
  return {
    edits,
    deleted,
    id: `ix-${opts.n}`,
    commandName: opts.command,
    ...(opts.command === "session" ? { subcommand: "start" } : {}),
    channelId: CHAN,
    userId: opts.userId,
    options:
      opts.command === "session"
        ? { topic: opts.text }
        : { description: opts.text },
    reply: async () => {},
    deferReply: async () => {},
    editReply: async (p) => {
      edits.push(p);
      return { messageId: `slash-reply-${opts.n}` };
    },
    deleteReply: async () => {
      deleted.push(opts.n);
    },
  };
}

async function bridge(outbound: ThinkingOutbound, allowlistFile = NO_ALLOWLIST) {
  const calls: Call[] = [];
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: CHAN,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: allowlistFile,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-slash-reply-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent: recordingAgent(calls),
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
  if (result.ok !== true || !box.handlers) {
    throw new Error("bridge did not start");
  }
  running.push(result);
  return { result, handlers: box.handlers, calls };
}

/** Session id of the Nth slash run (agent call order). */
function sessionOf(calls: Call[], i: number): string {
  const c = calls[i];
  if (!c) throw new Error(`no agent call #${i}`);
  return c.sessionId;
}

describe("slash answer reply continuity (DISCORD-2 / SESSION-MULTI-1)", () => {
  for (const command of ["session", "work"] as const) {
    for (const ping of [true, false]) {
      test(`/${command === "session" ? "session start" : "work"} A, then B; owner replies to A (ping ${ping ? "on" : "off"}) → A continues`, async () => {
        const outbound = memoryThinkingOutbound();
        const { handlers, calls } = await bridge(outbound);
        const onSlash = handlers.onSlash!;

        await onSlash(slash({ n: 1, command, userId: OWNER, text: "topic A" }));
        const answerA = outbound.sends[0]!.messageId;
        await onSlash(slash({ n: 2, command, userId: OWNER, text: "topic B" }));
        const sessionA = sessionOf(calls, 0);
        const sessionB = sessionOf(calls, 1);
        expect(sessionA).not.toBe(sessionB);
        // ASK-7: A's answer was collapsed into its own progress message.
        expect(
          outbound.contentEdits.some(
            (e) => e.messageId === answerA && e.content?.includes("topic A"),
          ),
        ).toBe(true);

        await handlers.onMessage({
          id: "m-reply",
          channelId: CHAN,
          authorId: OWNER,
          authorBot: false,
          // Discord's reply ping mentions the bot without a <@id> in the
          // content (the gateway sets mentionedBot from message.mentions).
          content: "follow up on A",
          mentionedBot: ping,
          referencedMessageId: answerA,
        });

        expect(calls).toHaveLength(3);
        expect(calls[2]).toMatchObject({
          sessionId: sessionA,
          resume: true,
          actingUserId: OWNER,
          humanText: "follow up on A",
        });
      });
    }
  }

  test("another user replying to the owner's /session start answer cannot hijack it", async () => {
    const outbound = memoryThinkingOutbound();
    const { result, handlers, calls } = await bridge(outbound);
    await handlers.onSlash!(
      slash({ n: 1, command: "session", userId: OWNER, text: "topic A" }),
    );
    const answerA = outbound.sends[0]!.messageId;
    const sessionA = sessionOf(calls, 0);

    // Ping off: a plain reply by someone else is ignored.
    await handlers.onMessage({
      id: "m-other-1",
      channelId: CHAN,
      authorId: OTHER,
      authorBot: false,
      content: "let me in",
      mentionedBot: false,
      referencedMessageId: answerA,
    });
    expect(calls).toHaveLength(1);

    // Ping on: the other user gets their own new session, never A.
    await handlers.onMessage({
      id: "m-other-2",
      channelId: CHAN,
      authorId: OTHER,
      authorBot: false,
      content: "<@999> let me in",
      mentionedBot: true,
      referencedMessageId: answerA,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.sessionId).not.toBe(sessionA);
    expect(calls[1]).toMatchObject({ resume: false, actingUserId: OTHER });
    expect(result.store.get(calls[1]!.sessionId)?.userId).toBe(OTHER);
    expect(result.store.get(sessionA)?.userId).toBe(OWNER);
  });

  test("fallback answer (no collapse) is tracked too: replying to it continues the session", async () => {
    // No editMessage → finalizeContent cannot collapse; the answer lands in
    // the deferred slash reply (editReply) instead.
    const base = memoryThinkingOutbound();
    const outbound: ThinkingOutbound = {
      sendEmbed: base.sendEmbed,
      editEmbed: base.editEmbed,
    };
    const { handlers, calls } = await bridge(outbound);
    const ixA = slash({ n: 1, command: "session", userId: OWNER, text: "topic A" });
    await handlers.onSlash!(ixA);
    await handlers.onSlash!(
      slash({ n: 2, command: "session", userId: OWNER, text: "topic B" }),
    );
    expect(ixA.edits.at(-1)?.content).toContain("topic A");
    const sessionA = sessionOf(calls, 0);

    await handlers.onMessage({
      id: "m-reply",
      channelId: CHAN,
      authorId: OWNER,
      authorBot: false,
      content: "follow up on A",
      mentionedBot: false,
      referencedMessageId: "slash-reply-1",
    });
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatchObject({ sessionId: sessionA, resume: true });
  });

  test("a member's /work A then B: their reply continues A; the owner's reply never does", async () => {
    const outbound = memoryThinkingOutbound();
    // IDENTITY-11.a: the member is declared team (community can't start /work).
    const { result, handlers, calls } = await bridge(outbound, teamPeopleFile(OTHER));
    await handlers.onSlash!(slash({ n: 1, command: "work", userId: OTHER, text: "topic A" }));
    const answerA = outbound.sends[0]!.messageId;
    await handlers.onSlash!(slash({ n: 2, command: "work", userId: OTHER, text: "topic B" }));
    const sessionA = sessionOf(calls, 0);
    expect(calls[0]!.actingUserId).toBe(OTHER);

    // The member (not the owner) continues their own session A.
    await handlers.onMessage({
      id: "m-member",
      channelId: CHAN,
      authorId: OTHER,
      authorBot: false,
      content: "follow up on A",
      mentionedBot: false,
      referencedMessageId: answerA,
    });
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatchObject({ sessionId: sessionA, resume: true, actingUserId: OTHER });

    // SESSION-MULTI-1: being ADMIN does not let the owner continue it.
    await handlers.onMessage({
      id: "m-owner-1",
      channelId: CHAN,
      authorId: OWNER,
      authorBot: false,
      content: "owner reply",
      mentionedBot: false,
      referencedMessageId: answerA,
    });
    expect(calls).toHaveLength(3);
    await handlers.onMessage({
      id: "m-owner-2",
      channelId: CHAN,
      authorId: OWNER,
      authorBot: false,
      content: "<@999> owner reply",
      mentionedBot: true,
      referencedMessageId: answerA,
    });
    expect(calls).toHaveLength(4);
    expect(calls[3]!.sessionId).not.toBe(sessionA);
    expect(calls[3]).toMatchObject({ resume: false, actingUserId: OWNER });
    expect(result.store.get(sessionA)?.userId).toBe(OTHER);
  });

  test("a failed tracking write does not stop the answer: the deferred reply is still resolved", async () => {
    const outbound = memoryThinkingOutbound();
    const { result, handlers } = await bridge(outbound);
    result.store.trackBotMessage = () => {
      throw new Error("database is locked");
    };
    const ix = slash({ n: 1, command: "session", userId: OWNER, text: "topic A" });
    await handlers.onSlash!(ix);
    // Collapsed into the thinking message, then the deferred reply dropped.
    expect(
      outbound.contentEdits.some((e) => e.content?.includes("topic A")),
    ).toBe(true);
    expect(ix.deleted).toEqual([1]);
  });
});
