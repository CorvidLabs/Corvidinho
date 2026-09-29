/**
 * DISCORD-5 / REQ-plugins-005 / REQ-discord-212 — deny always wins: a thread
 * on `deny_channels` under an allowlisted parent is refused silently on every
 * path (chat @mention, thread continuation, reply-to-bot, ask button, slash,
 * schedule, restart recovery), and a deny on the parent wins over an
 * allowlisted thread. DISCORD-DENY-1..3: MessageCreate stays silent; an
 * interaction gets only the ephemeral zero-width ack (the allowlist tip for an
 * admin). An allowlisted parent without a deny still serves its threads
 * (DISCORD-2.a). Fixtures only: fake gateway, in-memory stores, no Discord.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient, type AgentClient } from "../src/discord/agent-client.ts";
import { pickCustomId } from "../src/discord/ask-buttons.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  createNullGateway,
  type ComponentInteraction,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import { InflightReplyStore } from "../src/discord/inflight-replies.ts";
import { componentChannelAllowlisted, routeMessage } from "../src/discord/message-router.ts";
import { CORVIDINHO_PROTOCOL_VERSION } from "../src/discord/protocol-version.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import type { DiscordEmbedPayload } from "../src/discord/thinking-status.ts";
import {
  ALLOWLIST_DENY_TIP,
  EPHEMERAL_SILENT_ACK,
  type InboundMessage,
} from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { SchedulerService, type ScheduleRunFinished } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";
import { openCorvidinhoDb } from "../src/store/db.ts";

const OWNER_ID = "111122223333444455";
const MEMBER_ID = "222233334444555566";
const PARENT = "parent-1";
/** A thread under PARENT that is on deny_channels. */
const THREAD = "thread-denied";
/** Another thread under PARENT, not deny-listed. */
const OK_THREAD = "thread-ok";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cfg(channels: string[], denyChannels: string[] = []): AllowlistConfig {
  const c = emptyConfig();
  c.discord.channels = channels.map((x) => x.toLowerCase());
  c.discord.denyChannels = denyChannels.map((x) => x.toLowerCase());
  return c;
}

/** The W12 repro: parent allowlisted, one of its threads deny-listed. */
function threadDenied(): AllowlistConfig {
  return cfg([PARENT], [THREAD]);
}

function msg(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "m1",
    channelId: PARENT,
    authorId: OWNER_ID,
    authorBot: false,
    content: "<@bot> hi",
    mentionedBot: true,
    ...over,
  };
}

function silent(action: ReturnType<typeof routeMessage>): void {
  expect(action.kind === "ignore" || action.kind === "refuse").toBe(true);
  if (action.kind === "refuse") {
    expect(action.reason).toBe("channel_not_allowlisted");
    expect(action.reply).toBeUndefined();
  }
}

describe("router: a deny-listed thread under an allowlisted parent is refused silently (REQ-discord-212)", () => {
  test("a thread on deny_channels under an allowlisted parent is refused silently: no start or continue, no reply", () => {
    const store = new SessionStore();
    const allowlist = threadDenied();
    const mention = routeMessage(msg({ threadId: THREAD }), { store, allowlist });
    expect(mention).toEqual({ kind: "refuse", reason: "channel_not_allowlisted" });
    silent(
      routeMessage(msg({ id: "m2", threadId: THREAD, mentionedBot: false, content: "more" }), {
        store,
        allowlist,
      }),
    );
    expect(store.list()).toHaveLength(0);
  });

  test("a session started in the thread does not continue once the thread is deny-listed (thread, reply-to-bot, mention)", () => {
    const store = new SessionStore();
    const allowlist = cfg([PARENT]);
    const start = routeMessage(msg({ id: "m0", threadId: THREAD }), { store, allowlist });
    expect(start.kind).toBe("start_session");
    if (start.kind !== "start_session") return;
    store.trackBotMessage("bot-1", start.session);

    allowlist.discord.denyChannels = [THREAD];
    const tries: Array<Partial<InboundMessage>> = [
      { id: "m-thread", mentionedBot: false, content: "more in thread" },
      { id: "m-reply", mentionedBot: false, content: "follow up", referencedMessageId: "bot-1" },
      { id: "m-mention", mentionedBot: true, content: "<@bot> again" },
    ];
    for (const over of tries) {
      silent(routeMessage(msg({ threadId: THREAD, ...over }), { store, allowlist }));
    }
    expect(store.list()).toHaveLength(1);
  });

  test("a deny on the parent wins over an allowlisted thread", () => {
    const store = new SessionStore();
    const allowlist = cfg([OK_THREAD], [PARENT]);
    expect(routeMessage(msg({ threadId: OK_THREAD }), { store, allowlist })).toEqual({
      kind: "refuse",
      reason: "channel_not_allowlisted",
    });
    expect(store.list()).toHaveLength(0);
  });

  test("the allowlisted parent still serves its other threads and itself (DISCORD-2.a)", () => {
    const store = new SessionStore();
    const allowlist = threadDenied();
    expect(routeMessage(msg({ id: "m-ok", threadId: OK_THREAD }), { store, allowlist }).kind).toBe(
      "start_session",
    );
    expect(routeMessage(msg({ id: "m-parent" }), { store, allowlist }).kind).toBe("start_session");
  });
});

describe("componentChannelAllowlisted: deny wins over an allowlisted parent (REQ-discord-212)", () => {
  test("a press in the deny-listed thread, or for a session in it, is not allowlisted", () => {
    const allowlist = threadDenied();
    const inDenied = { channelId: PARENT, threadId: THREAD };
    expect(componentChannelAllowlisted(THREAD, inDenied, allowlist)).toBe(false);
    // Pressed in the parent, the resumed run would still post in the denied thread.
    expect(componentChannelAllowlisted(PARENT, inDenied, allowlist)).toBe(false);
    expect(componentChannelAllowlisted(THREAD, undefined, allowlist)).toBe(false);
  });

  test("a deny on the session's parent wins over an allowlisted thread", () => {
    const allowlist = cfg([OK_THREAD], [PARENT]);
    expect(
      componentChannelAllowlisted(OK_THREAD, { channelId: PARENT, threadId: OK_THREAD }, allowlist),
    ).toBe(false);
  });

  test("a thread under the allowlisted parent without a deny still counts (DISCORD-2.a)", () => {
    const allowlist = threadDenied();
    expect(
      componentChannelAllowlisted(OK_THREAD, { channelId: PARENT, threadId: OK_THREAD }, allowlist),
    ).toBe(true);
  });
});

type Reply = { channelId: string; content: string; replyToMessageId?: string };

const BUTTON_ASK: HumanAsk = {
  reason: "clarify",
  question: "Which DB?",
  options: [
    { id: "1", label: "Postgres" },
    { id: "2", label: "SQLite" },
  ],
};

async function bridge(opts: { deny?: string; ownerId?: string; ask?: boolean } = {}) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const prompts: string[] = [];
  const agent: AgentClient = {
    async runChat({ sessionId, prompt }) {
      prompts.push(prompt);
      if (opts.ask && prompts.length === 1) {
        return {
          ok: true,
          sessionId,
          summary: "need input",
          exitCode: 0,
          ask: BUTTON_ASK,
          task: { verified: false, verifySkipped: true, state: "blocked" },
        };
      }
      return { ok: true, sessionId, summary: `answer ${prompts.length}`, exitCode: 0 };
    },
  };
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: PARENT,
      ...(opts.deny ? { CORVIDINHO_DISCORD_DENY_CHANNELS: opts.deny } : {}),
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-thread-deny-"), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: opts.ownerId ?? OWNER_ID,
    },
    projectRoot: tempDir("corvidinho-thread-deny-proj-"),
    skipProtocolCheck: true,
    disableScheduler: true,
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
  cleanups.push(() => result.stop());
  const posted = () =>
    replies.length +
    outbound.sends.length +
    outbound.edits.length +
    outbound.contentEdits.length +
    outbound.deletes.length;
  return { result, handlers: box.handlers, replies, prompts, outbound, posted };
}

describe("bridge: a deny-listed thread under an allowlisted parent (DISCORD-5 / DISCORD-DENY-1)", () => {
  test("the owner's @mention in the deny-listed thread: agent not run, nothing posted, no session", async () => {
    const b = await bridge({ deny: THREAD });
    await b.handlers.onMessage(msg({ threadId: THREAD }));
    expect(b.prompts).toHaveLength(0);
    expect(b.posted()).toBe(0);
    expect(b.result.store.list()).toHaveLength(0);
  });

  test("a talk in the thread stops once the thread is deny-listed: no continue, no reply-to-bot, nothing posted", async () => {
    const b = await bridge();
    await b.handlers.onMessage(msg({ id: "m-t0", threadId: THREAD }));
    expect(b.prompts).toHaveLength(1);
    const tracked = b.outbound.sends[0]!.messageId;
    const before = b.posted();

    b.result.config.allowlist.discord.denyChannels = [THREAD];
    await b.handlers.onMessage(
      msg({ id: "m-t1", threadId: THREAD, mentionedBot: false, content: "more in thread" }),
    );
    await b.handlers.onMessage(
      msg({ id: "m-t2", threadId: THREAD, mentionedBot: false, content: "follow up", referencedMessageId: tracked }),
    );
    await b.handlers.onMessage(msg({ id: "m-t3", threadId: THREAD }));
    expect(b.prompts).toHaveLength(1);
    expect(b.posted()).toBe(before);
    expect(b.result.store.list()).toHaveLength(1);
  });

  test("the allowlisted parent's other threads are still served (DISCORD-2.a)", async () => {
    const b = await bridge({ deny: THREAD });
    await b.handlers.onMessage(msg({ id: "m-ok", threadId: OK_THREAD }));
    expect(b.prompts).toHaveLength(1);
  });
});

describe("bridge: an ask button in a deny-listed thread does not resume (DISCORD-DENY-2/3)", () => {
  function press(
    askId: string,
    channelId: string,
    userId: string,
    acks: Array<{ content?: string; ephemeral?: boolean }>,
  ): ComponentInteraction {
    return {
      id: `ix-${channelId}`,
      customId: pickCustomId(askId, "1"),
      channelId,
      userId,
      reply: async (o) => {
        acks.push(o);
      },
    };
  }

  async function withAsk(ownerId = OWNER_ID) {
    const b = await bridge({ ask: true, ownerId });
    await b.handlers.onMessage(msg({ id: "m-ask", authorId: MEMBER_ID, threadId: THREAD }));
    const pending = b.result.store.list()[0]?.pendingAsk;
    if (!pending?.options?.length) throw new Error("no button ask");
    b.result.config.allowlist.discord.denyChannels = [THREAD];
    return { ...b, askId: pending.askId };
  }

  test("press in the thread: zero-width ack only, no resume, nothing posted, ask stays pending", async () => {
    const b = await withAsk();
    const before = b.posted();
    const acks: Array<{ content?: string; ephemeral?: boolean }> = [];
    await b.handlers.onComponent!(press(b.askId, THREAD, MEMBER_ID, acks));
    expect(acks).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
    expect(b.prompts).toHaveLength(1);
    expect(b.posted()).toBe(before);
    expect(b.result.store.list()[0]!.pendingAsk?.askId).toBe(b.askId);
  });

  test("an admin's press gets only the ephemeral allowlist tip; no resume", async () => {
    const b = await withAsk(MEMBER_ID);
    const before = b.posted();
    const acks: Array<{ content?: string; ephemeral?: boolean }> = [];
    await b.handlers.onComponent!(press(b.askId, THREAD, MEMBER_ID, acks));
    expect(acks).toEqual([{ content: ALLOWLIST_DENY_TIP, ephemeral: true }]);
    expect(b.prompts).toHaveLength(1);
    expect(b.posted()).toBe(before);
  });
});

describe("slash and schedule: the thread id itself is gated, so deny wins there too (REQ-discord-212)", () => {
  function slashCtx(allowlist: AllowlistConfig, scheduleStore = new ScheduleStore()): SlashContext {
    return {
      store: new SessionStore(),
      workStore: new WorkStore(),
      scheduleStore,
      allowlist,
      agent: createEchoAgentClient({ delayMs: 0 }),
      version: "0.0.0",
      protocolVersion: CORVIDINHO_PROTOCOL_VERSION,
      startedAt: Date.now(),
      channelIds: allowlist.discord.channels,
      owner: { discordId: OWNER_ID },
    };
  }

  function slash(
    over: Partial<SlashInteraction> & { commandName: string },
  ): SlashInteraction & { replies: SlashReplyPayload[] } {
    const replies: SlashReplyPayload[] = [];
    return {
      id: "ix-1",
      channelId: THREAD,
      userId: MEMBER_ID,
      options: {},
      ...over,
      replies,
      reply: async (o) => {
        replies.push(o);
      },
    };
  }

  test("a slash command in the deny-listed thread: zero-width ack (tip for the owner), nothing started", async () => {
    const ctx = slashCtx(threadDenied());
    const member = slash({ commandName: "session", subcommand: "start", options: { topic: "x" } });
    const r = await handleSlashInteraction(ctx, member);
    expect(r).toMatchObject({ ok: false, reason: "channel_not_allowlisted" });
    expect(member.replies).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
    const owner = slash({ commandName: "status", userId: OWNER_ID });
    await handleSlashInteraction(ctx, owner);
    expect(owner.replies).toEqual([{ content: ALLOWLIST_DENY_TIP, ephemeral: true }]);
    expect(ctx.store.list()).toHaveLength(0);
  });

  test("/schedule create naming the deny-listed thread as its channel is refused; nothing scheduled", async () => {
    const ctx = slashCtx(threadDenied());
    const ix = slash({
      commandName: "schedule",
      subcommand: "create",
      channelId: PARENT,
      userId: OWNER_ID,
      options: { name: "Hourly", cadence: "@hourly", project: ".", prompt: "dig", channel: THREAD },
    });
    await handleSlashInteraction(ctx, ix);
    expect(ix.replies).toHaveLength(1);
    expect(ix.replies[0]!.ephemeral).toBe(true);
    expect(ix.replies[0]!.content).toContain("not allowlisted");
    expect(ctx.scheduleStore!.list()).toHaveLength(0);
  });

  test("a schedule whose channel is the deny-listed thread neither runs nor posts at tick", async () => {
    const store = new ScheduleStore();
    const past = Date.now() - 60_000;
    const s = store.create({
      name: "job",
      cronExpression: "0 * * * *",
      project: "p",
      prompt: "do thing",
      createdByUserId: OWNER_ID,
      channelId: THREAD,
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const calls: string[] = [];
    const posts: Array<{ channelId: string; content: string }> = [];
    const finished: ScheduleRunFinished[] = [];
    const svc = new SchedulerService({
      store,
      agent: {
        async runChat({ sessionId }) {
          calls.push(sessionId);
          return { ok: true, sessionId, summary: "done", exitCode: 0 };
        },
      },
      allowlist: threadDenied(),
      owner: { discordId: OWNER_ID },
      manual: true,
      maxConcurrent: 1,
      useWorktrees: false,
      outbound: {
        post: async (p) => {
          posts.push(p);
        },
      },
      onRunFinished: (e) => finished.push(e),
    });
    await svc.tick();
    expect(await svc.drain(2_000)).toBe(true);
    expect(calls).toEqual([]);
    expect(posts).toEqual([]);
    expect(finished[0]).toMatchObject({ ok: false, error: `channel not allowlisted: ${THREAD}` });
  });
});

describe("restart recovery posts nothing in a deny-listed thread (REQ-discord-311)", () => {
  async function recoverWith(env: Record<string, string>, row: { channelId: string; parentChannelId: string }) {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const inflight = new InflightReplyStore(db);
    const r = inflight.begin({ sessionId: "s", requestMessageId: "req-1", ...row });
    inflight.setProgressMessage(r.id, "p1");
    const calls = {
      sends: [] as Array<{ channelId: string; embed: DiscordEmbedPayload }>,
      edits: [] as Array<{ channelId: string; messageId: string }>,
      replies: [] as Reply[],
    };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-thread-deny-rec-"), "none.toml"),
        ...env,
      },
      projectRoot: tempDir("corvidinho-thread-deny-rec-proj-"),
      db,
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent: createEchoAgentClient(),
      gatewayFactory: async (_cfg, handlers) => {
        handlers.sendEmbed = async (o) => {
          calls.sends.push(o);
          return { messageId: `sent_${calls.sends.length}` };
        };
        handlers.editEmbed = async (o) => {
          calls.edits.push(o);
          return true;
        };
        handlers.reply = async (o) => {
          calls.replies.push(o);
          return { messageId: `reply_${calls.replies.length}` };
        };
        return createNullGateway();
      },
    });
    if (!result.ok) throw new Error(result.message);
    cleanups.push(() => result.stop());
    return { calls, rows: inflight.list() };
  }

  test("a row in a deny-listed thread under an allowlisted parent: nothing edited or replied, row deleted", async () => {
    const { calls, rows } = await recoverWith(
      { DISCORD_CHANNEL_IDS: PARENT, CORVIDINHO_DISCORD_DENY_CHANNELS: THREAD },
      { channelId: THREAD, parentChannelId: PARENT },
    );
    expect(calls.edits).toHaveLength(0);
    expect(calls.replies).toHaveLength(0);
    expect(calls.sends).toHaveLength(0);
    expect(rows).toEqual([]);
  });

  test("a row in an allowlisted thread under a deny-listed parent: nothing edited or replied, row deleted", async () => {
    const { calls, rows } = await recoverWith(
      { DISCORD_CHANNEL_IDS: OK_THREAD, CORVIDINHO_DISCORD_DENY_CHANNELS: PARENT },
      { channelId: OK_THREAD, parentChannelId: PARENT },
    );
    expect(calls.edits).toHaveLength(0);
    expect(calls.replies).toHaveLength(0);
    expect(rows).toEqual([]);
  });

  test("a row in a thread under the allowlisted parent without a deny is still recovered there", async () => {
    const { calls, rows } = await recoverWith(
      { DISCORD_CHANNEL_IDS: PARENT, CORVIDINHO_DISCORD_DENY_CHANNELS: THREAD },
      { channelId: OK_THREAD, parentChannelId: PARENT },
    );
    expect(calls.edits.map((e) => [e.channelId, e.messageId])).toEqual([[OK_THREAD, "p1"]]);
    expect(rows).toEqual([]);
  });
});
