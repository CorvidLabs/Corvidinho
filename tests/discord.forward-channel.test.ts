/**
 * DISCORD-5 / DISCORD-DENY-1 / REQ-discord-212 — a tracked bot message
 * referenced from a non-allowlisted channel (a Discord *forward*) must not
 * continue the session there: silent, no spawn, nothing posted. Replies in the
 * same allowlisted channel and threads under an allowlisted parent still
 * continue (DISCORD-2 / DISCORD-2.a).
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageReferenceType } from "discord.js";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  REFERENCE_TYPE_FORWARD,
  replyReferenceMessageId,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import { routeMessage } from "../src/discord/message-router.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import type { InboundMessage } from "../src/discord/types.ts";

const OWNER_ID = "111122223333444455";
const ON = "chan-on";
const OFF = "chan-off";

function msg(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "m1",
    channelId: ON,
    authorId: OWNER_ID,
    authorBot: false,
    content: "<@bot> do the thing",
    mentionedBot: true,
    ...over,
  };
}

function allowCfg(channels: string[] = [ON]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
  return cfg;
}

describe("router: own channel must be allowlisted (DISCORD-5 / DISCORD-DENY-1)", () => {
  function started() {
    const store = new SessionStore();
    const allowlist = allowCfg();
    const start = routeMessage(msg({ id: "m-start" }), { store, allowlist });
    if (start.kind !== "start_session") throw new Error("no session");
    store.trackBotMessage("bot-1", start.session);
    return { store, allowlist, session: start.session };
  }

  test("tracked bot message referenced from a non-allowlisted channel: silent, no continue", () => {
    const { store, allowlist } = started();
    for (const mentionedBot of [false, true]) {
      const action = routeMessage(
        msg({
          id: `m-fwd-${mentionedBot}`,
          channelId: OFF,
          content: "forwarded",
          mentionedBot,
          referencedMessageId: "bot-1",
        }),
        { store, allowlist },
      );
      expect(action.kind === "ignore" || action.kind === "refuse").toBe(true);
      if (action.kind === "refuse") {
        expect(action.reason).toBe("channel_not_allowlisted");
        expect(action.reply).toBeUndefined();
      }
    }
    expect(store.bySessionId.size).toBe(1);
  });

  test("thread under a non-allowlisted parent cannot continue an allowlisted session", () => {
    const store = new SessionStore();
    const allowlist = allowCfg();
    // A session stub whose recorded channel is allowlisted but whose thread
    // now sits under OFF must not continue from OFF.
    const session = store.create({ channelId: ON, userId: OWNER_ID, threadId: "thr-x" });
    const action = routeMessage(
      msg({ id: "m-thr", channelId: OFF, threadId: "thr-x", mentionedBot: false, content: "more" }),
      { store, allowlist },
    );
    expect(action.kind === "ignore" || action.kind === "refuse").toBe(true);
    if (action.kind === "refuse") expect(action.reply).toBeUndefined();
    expect(store.getByThread("thr-x")?.id).toBe(session.id);
  });

  test("reply in the same allowlisted channel still continues (DISCORD-2)", () => {
    const { store, allowlist, session } = started();
    const action = routeMessage(
      msg({ id: "m-reply", mentionedBot: false, content: "follow up", referencedMessageId: "bot-1" }),
      { store, allowlist },
    );
    expect(action.kind).toBe("continue_session");
    if (action.kind === "continue_session") expect(action.session.id).toBe(session.id);
  });

  test("thread under an allowlisted parent still continues (DISCORD-2.a)", () => {
    const store = new SessionStore();
    const allowlist = allowCfg();
    const start = routeMessage(msg({ id: "m-t0", threadId: "thr-1" }), { store, allowlist });
    expect(start.kind).toBe("start_session");
    if (start.kind !== "start_session") return;
    const cont = routeMessage(
      msg({ id: "m-t1", threadId: "thr-1", mentionedBot: false, content: "more in thread" }),
      { store, allowlist },
    );
    expect(cont.kind).toBe("continue_session");
    if (cont.kind === "continue_session") expect(cont.session.id).toBe(start.session.id);
  });
});

describe("gateway: only same-channel replies count as a reply reference (DISCORD-2 / DISCORD-5)", () => {
  test("forward constant matches discord.js MessageReferenceType.Forward", () => {
    expect(REFERENCE_TYPE_FORWARD).toBe(MessageReferenceType.Forward);
  });

  test("forward-type reference is ignored", () => {
    expect(
      replyReferenceMessageId(
        { messageId: "bot-1", channelId: ON, type: MessageReferenceType.Forward },
        { channelId: OFF },
      ),
    ).toBeUndefined();
    // Even when Discord reports the forward with the same channel id.
    expect(
      replyReferenceMessageId(
        { messageId: "bot-1", channelId: OFF, type: MessageReferenceType.Forward },
        { channelId: OFF },
      ),
    ).toBeUndefined();
  });

  test("reference from another channel is ignored", () => {
    expect(
      replyReferenceMessageId(
        { messageId: "bot-1", channelId: ON, type: MessageReferenceType.Default },
        { channelId: OFF },
      ),
    ).toBeUndefined();
    expect(
      replyReferenceMessageId({ messageId: "bot-1", channelId: ON }, { channelId: OFF }),
    ).toBeUndefined();
  });

  test("same-channel reply (default or missing type) keeps the message id", () => {
    expect(
      replyReferenceMessageId(
        { messageId: "bot-1", channelId: ON, type: MessageReferenceType.Default },
        { channelId: ON },
      ),
    ).toBe("bot-1");
    expect(
      replyReferenceMessageId({ messageId: "bot-1", channelId: ON }, { channelId: ON }),
    ).toBe("bot-1");
  });

  test("reply inside a thread: thread id or its parent id count as the message's own channel", () => {
    expect(
      replyReferenceMessageId(
        { messageId: "bot-1", channelId: "thr-1", type: MessageReferenceType.Default },
        { channelId: "thr-1", parentId: ON },
      ),
    ).toBe("bot-1");
    expect(
      replyReferenceMessageId(
        { messageId: "bot-1", channelId: ON, type: MessageReferenceType.Default },
        { channelId: "thr-1", parentId: ON },
      ),
    ).toBe("bot-1");
    expect(
      replyReferenceMessageId(
        { messageId: "bot-1", channelId: OFF, type: MessageReferenceType.Default },
        { channelId: "thr-1", parentId: ON },
      ),
    ).toBeUndefined();
  });

  test("no reference or no message id → undefined", () => {
    expect(replyReferenceMessageId(null, { channelId: ON })).toBeUndefined();
    expect(replyReferenceMessageId(undefined, { channelId: ON })).toBeUndefined();
    expect(
      replyReferenceMessageId({ channelId: ON, type: MessageReferenceType.Default }, { channelId: ON }),
    ).toBeUndefined();
  });
});

type Reply = { channelId: string; content: string; replyToMessageId?: string };

async function bridgeWith() {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const prompts: string[] = [];
  const agent: AgentClient = {
    async runChat({ sessionId, prompt }) {
      prompts.push(prompt);
      return { ok: true, sessionId, summary: `answer ${prompts.length}`, exitCode: 0 };
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: ON,
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(mkdtempSync(join(tmpdir(), "corvidinho-fwd-")), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
    },
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-fwd-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent,
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async (opts) => {
        replies.push(opts);
        return { messageId: `bot_${replies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok || !box.handlers) throw new Error("bridge did not start");
  return { result, handlers: box.handlers, replies, prompts, outbound };
}

function postedIn(
  channelId: string,
  b: Awaited<ReturnType<typeof bridgeWith>>,
): number {
  const { replies, outbound } = b;
  return [
    ...replies,
    ...outbound.sends,
    ...outbound.edits,
    ...outbound.contentEdits,
    ...outbound.deletes,
  ].filter((p) => p.channelId === channelId).length;
}

describe("bridge: forward of a tracked bot message into a non-allowlisted channel (DISCORD-5 / DISCORD-DENY-1)", () => {
  test("owner forward into OFF: silent, no spawn, nothing posted; same-channel reply still continues", async () => {
    const b = await bridgeWith();
    const { result, handlers, prompts, outbound } = b;
    await handlers.onMessage(msg({ id: "m-start" }));
    expect(prompts).toHaveLength(1);
    const tracked = outbound.sends[0]!.messageId;
    const session = result.store.getByBotMessage(tracked);
    expect(session).toBeDefined();

    // Gateway resolves a real forward to no reply reference at all …
    expect(
      replyReferenceMessageId(
        { messageId: tracked, channelId: ON, type: MessageReferenceType.Forward },
        { channelId: OFF },
      ),
    ).toBeUndefined();
    // … and even if a reference into OFF reaches the router, it stays silent.
    for (const mentionedBot of [false, true]) {
      await handlers.onMessage(
        msg({
          id: `m-fwd-${mentionedBot}`,
          channelId: OFF,
          content: "forwarded",
          mentionedBot,
          referencedMessageId: tracked,
        }),
      );
    }
    expect(prompts).toHaveLength(1);
    expect(postedIn(OFF, b)).toBe(0);

    // DISCORD-2 — reply in the allowlisted channel continues the same session.
    await handlers.onMessage(
      msg({ id: "m-reply", mentionedBot: false, content: "follow up", referencedMessageId: tracked }),
    );
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("follow up");
    expect(result.store.list()).toHaveLength(1);
    expect(postedIn(OFF, b)).toBe(0);
    await result.stop();
  });

  test("thread under the allowlisted parent still continues (DISCORD-2.a)", async () => {
    const b = await bridgeWith();
    const { result, handlers, prompts } = b;
    await handlers.onMessage(msg({ id: "m-t0", threadId: "thr-1" }));
    await handlers.onMessage(
      msg({ id: "m-t1", threadId: "thr-1", mentionedBot: false, content: "more in thread" }),
    );
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("more in thread");
    expect(result.store.list()).toHaveLength(1);
    await result.stop();
  });
});
