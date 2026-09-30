/**
 * DISCORD-5 / REQ-plugins-005 / REQ-discord-212 — a thread on
 * `deny_channels` under an allowlisted parent is refused silently on every
 * path (chat @mention, thread continuation, reply-to-bot, ask button, slash,
 * schedule, restart recovery, discord-post-message). A deny on the parent
 * alone reaches a thread allowlisted by its own id only where the bridge
 * knows the parent: a message in the thread (and the restart row and reply
 * channel of the run it starts or continues), and the ask buttons and pick
 * runs of a session a message started there. Slash, `/schedule` and
 * discord-post-message gate the id they are given, so there (and for a
 * `/session start` run in the thread and its session's ask buttons and pick
 * runs) the thread is served by its own id.
 * DISCORD-DENY-1..3: MessageCreate stays silent; an interaction gets only the
 * ephemeral zero-width ack (the allowlist tip for an admin). An allowlisted
 * parent without a deny still serves its threads (DISCORD-2.a). Fixtures
 * only: fake gateway, in-memory stores, no Discord.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig, type AllowlistConfig } from "../src/allowlist/types.ts";
import {
  createEchoAgentClient,
  type AgentClient,
  type AgentRunChatOpts,
} from "../src/discord/agent-client.ts";
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
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
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

/** A thread allowlisted by its own id under a deny-listed parent. */
function parentDenied(): AllowlistConfig {
  return cfg([OK_THREAD], [PARENT]);
}

/** Parent and thread both allowlisted, the parent also deny-listed. */
function parentDeniedBothListed(): AllowlistConfig {
  return cfg([PARENT, OK_THREAD], [PARENT]);
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

async function bridge(
  opts: {
    channels?: string;
    deny?: string;
    ownerId?: string;
    ask?: boolean;
    /** Shared DB; with `inflight` over it, each run sees the restart rows open while it runs. */
    db?: ReturnType<typeof openCorvidinhoDb>;
    inflight?: InflightReplyStore;
  } = {},
) {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const outbound = memoryThinkingOutbound();
  const replies: Reply[] = [];
  const prompts: string[] = [];
  const calls: AgentRunChatOpts[] = [];
  const rowsAtRun: Array<Array<{ channelId: string; parentChannelId: string | null }>> = [];
  const agent: AgentClient = {
    async runChat(input) {
      const { sessionId, prompt } = input;
      calls.push(input);
      prompts.push(prompt);
      rowsAtRun.push(
        (opts.inflight?.list() ?? []).map((r) => ({
          channelId: r.channelId,
          parentChannelId: r.parentChannelId,
        })),
      );
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
      DISCORD_CHANNEL_IDS: opts.channels ?? PARENT,
      ...(opts.deny ? { CORVIDINHO_DISCORD_DENY_CHANNELS: opts.deny } : {}),
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: join(tempDir("corvidinho-thread-deny-"), "none.toml"),
      CORVIDINHO_OWNER_DISCORD_ID: opts.ownerId ?? OWNER_ID,
    },
    projectRoot: tempDir("corvidinho-thread-deny-proj-"),
    ...(opts.db ? { db: opts.db } : {}),
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
  return { result, handlers: box.handlers, replies, prompts, calls, rowsAtRun, outbound, posted };
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

describe("bridge: an ask button in a deny-listed thread does not resume (DISCORD-DENY-2/3)", () => {
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

/** A due schedule on `channelId`, ticked once under `allowlist`. */
async function tickSchedule(channelId: string, allowlist: AllowlistConfig) {
  const store = new ScheduleStore();
  const past = Date.now() - 60_000;
  const s = store.create({
    name: "job",
    cronExpression: "0 * * * *",
    project: "p",
    prompt: "do thing",
    createdByUserId: OWNER_ID,
    channelId,
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
    allowlist,
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
  cleanups.push(() => svc.stop());
  await svc.tick();
  expect(await svc.drain(2_000)).toBe(true);
  return { calls, posts, finished };
}

describe("slash and schedule: the thread id itself is gated, so deny wins there too (REQ-discord-212)", () => {
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
    const { calls, posts, finished } = await tickSchedule(THREAD, threadDenied());
    expect(calls).toEqual([]);
    expect(posts).toEqual([]);
    expect(finished[0]).toMatchObject({ ok: false, error: `channel not allowlisted: ${THREAD}` });
  });
});

describe("restart recovery posts nothing in a deny-listed thread (REQ-discord-311)", () => {
  async function recoverWith(
    env: Record<string, string>,
    row: { channelId: string; parentChannelId: string | null },
  ) {
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

  test("a button-pick row of a /session start session in a thread allowlisted by its own id records no parent, so a deny on the parent alone does not stop its recovery", async () => {
    const { calls, rows } = await recoverWith(
      { DISCORD_CHANNEL_IDS: OK_THREAD, CORVIDINHO_DISCORD_DENY_CHANNELS: PARENT },
      { channelId: OK_THREAD, parentChannelId: null },
    );
    expect(calls.edits.map((e) => [e.channelId, e.messageId])).toEqual([[OK_THREAD, "p1"]]);
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

describe("a deny on the parent alone reaches its threads only where the parent is known (REQ-discord-212)", () => {
  test("parent and thread both listed, parent deny-listed: a message in the thread is refused silently (MessageCreate knows the parent)", () => {
    const store = new SessionStore();
    const allowlist = parentDeniedBothListed();
    expect(routeMessage(msg({ threadId: OK_THREAD }), { store, allowlist })).toEqual({
      kind: "refuse",
      reason: "channel_not_allowlisted",
    });
    silent(
      routeMessage(msg({ id: "m2", threadId: OK_THREAD, mentionedBot: false, content: "more" }), {
        store,
        allowlist,
      }),
    );
    expect(store.list()).toHaveLength(0);
  });

  test("through the bridge, a message in that thread runs no agent and posts nothing: a new @mention, and a talk started there before the parent was deny-listed (thread listed alone, or with the parent)", async () => {
    for (const channels of [[OK_THREAD], [PARENT, OK_THREAD]]) {
      const fresh = await bridge({ channels: channels.join(","), deny: PARENT });
      await fresh.handlers.onMessage(msg({ threadId: OK_THREAD }));
      expect(fresh.prompts).toHaveLength(0);
      expect(fresh.posted()).toBe(0);
      expect(fresh.result.store.list()).toHaveLength(0);

      // A talk started while the parent was listed and not denied; then the
      // live allowlist becomes `channels` with the parent deny-listed. The
      // thread's own id is still listed, so only the parent deny stops it.
      const b = await bridge({ channels: `${PARENT},${OK_THREAD}` });
      await b.handlers.onMessage(msg({ id: "m-t0", threadId: OK_THREAD }));
      expect(b.prompts).toHaveLength(1);
      const tracked = b.outbound.sends[0]!.messageId;
      const before = b.posted();
      b.result.config.allowlist.discord.channels = channels;
      b.result.config.allowlist.discord.denyChannels = [PARENT];
      await b.handlers.onMessage(
        msg({ id: "m-t1", threadId: OK_THREAD, mentionedBot: false, content: "more in thread" }),
      );
      await b.handlers.onMessage(
        msg({ id: "m-t2", threadId: OK_THREAD, mentionedBot: false, content: "follow up", referencedMessageId: tracked }),
      );
      await b.handlers.onMessage(msg({ id: "m-t3", threadId: OK_THREAD }));
      expect(b.prompts).toHaveLength(1);
      expect(b.posted()).toBe(before);
    }
  });

  test("an ask press for a session a message started in that thread gets no resume; one for a /session start session there (no thread id) is judged on the thread's own id", () => {
    for (const allowlist of [parentDenied(), parentDeniedBothListed()]) {
      expect(
        componentChannelAllowlisted(OK_THREAD, { channelId: PARENT, threadId: OK_THREAD }, allowlist),
      ).toBe(false);
      expect(componentChannelAllowlisted(OK_THREAD, { channelId: OK_THREAD }, allowlist)).toBe(true);
    }
    // A deny on the thread itself still wins for a /session start session in it.
    expect(componentChannelAllowlisted(THREAD, { channelId: THREAD }, threadDenied())).toBe(false);
  });

  test("through the bridge, a press for a session a message started in that thread, once the parent is deny-listed, gets only the zero-width ack: no resume, nothing posted, ask kept", async () => {
    for (const channels of [[OK_THREAD], [PARENT, OK_THREAD]]) {
      const b = await bridge({ channels: `${PARENT},${OK_THREAD}`, ask: true });
      await b.handlers.onMessage(msg({ id: "m-ask", authorId: MEMBER_ID, threadId: OK_THREAD }));
      const pending = b.result.store.list()[0]?.pendingAsk;
      if (!pending?.options?.length) throw new Error("no button ask");
      b.result.config.allowlist.discord.channels = channels;
      b.result.config.allowlist.discord.denyChannels = [PARENT];
      const before = b.posted();
      const acks: Array<{ content?: string; ephemeral?: boolean }> = [];
      await b.handlers.onComponent!(press(pending.askId, OK_THREAD, MEMBER_ID, acks));
      expect(acks).toEqual([{ content: EPHEMERAL_SILENT_ACK, ephemeral: true }]);
      expect(b.prompts).toHaveLength(1);
      expect(b.posted()).toBe(before);
      expect(b.result.store.list()[0]!.pendingAsk?.askId).toBe(pending.askId);
    }
  });

  test("a slash command in a thread allowlisted by its own id is served although its parent is deny-listed (slash gates the id it is given)", async () => {
    for (const allowlist of [parentDenied(), parentDeniedBothListed()]) {
      const ctx = slashCtx(allowlist);
      const ix = slash({ commandName: "status", channelId: OK_THREAD, userId: OWNER_ID });
      const r = await handleSlashInteraction(ctx, ix);
      expect(r.ok).toBe(true);
      expect(ix.replies).toHaveLength(1);
      expect(ix.replies[0]!.content).not.toBe(EPHEMERAL_SILENT_ACK);
      expect(ix.replies[0]!.content).not.toBe(ALLOWLIST_DENY_TIP);
    }
  });

  test("/schedule create naming that thread as its channel is accepted, and its tick runs and posts in the thread (schedule gates the id it is given)", async () => {
    for (const allowlist of [parentDenied, parentDeniedBothListed]) {
      const ctx = slashCtx(allowlist());
      const ix = slash({
        commandName: "schedule",
        subcommand: "create",
        channelId: OK_THREAD,
        userId: OWNER_ID,
        options: { name: "Hourly", cadence: "@hourly", project: ".", prompt: "dig", channel: OK_THREAD },
      });
      await handleSlashInteraction(ctx, ix);
      expect(ix.replies).toHaveLength(1);
      expect(ix.replies[0]!.content).toContain("Schedule created");
      expect(ctx.scheduleStore!.list().map((s) => s.channelId)).toEqual([OK_THREAD]);

      const { calls, posts, finished } = await tickSchedule(OK_THREAD, allowlist());
      expect(calls).toHaveLength(1);
      expect(posts.map((p) => p.channelId)).toEqual([OK_THREAD]);
      expect(finished[0]).toMatchObject({ ok: true });
    }
  });

  test("an ask press for a /session start session in that thread resumes it there, with no parent passed to the run (so discord-send-file and a restart row judge the thread alone)", async () => {
    for (const channels of [OK_THREAD, `${PARENT},${OK_THREAD}`]) {
      const b = await bridge({ channels, deny: PARENT, ask: true });
      const ix: SlashInteraction = {
        id: "ix-session",
        commandName: "session",
        subcommand: "start",
        channelId: OK_THREAD,
        userId: OWNER_ID,
        options: { topic: "pick a DB" },
        reply: async () => {},
        deferReply: async () => {},
        editReply: async () => undefined,
        deleteReply: async () => {},
      };
      await b.handlers.onSlash!(ix);
      expect(b.prompts).toHaveLength(1);
      const session = b.result.store.list()[0]!;
      expect(session.channelId).toBe(OK_THREAD);
      expect(session.threadId).toBeUndefined();
      const askId = session.pendingAsk?.askId;
      if (!askId) throw new Error("no button ask");

      const acks: Array<{ content?: string; ephemeral?: boolean }> = [];
      await b.handlers.onComponent!(press(askId, OK_THREAD, OWNER_ID, acks));
      expect(acks).not.toContainEqual({ content: EPHEMERAL_SILENT_ACK, ephemeral: true });
      expect(b.prompts).toHaveLength(2);
      expect(b.calls[1]!.sessionId).toBe(session.id);
      expect(b.calls[1]!.replyChannelId).toBe(OK_THREAD);
      expect(b.calls[1]!.replyParentChannelId).toBeUndefined();
    }
  });

  test("a reply in the thread to a /session start session's answer is a message run: it passes the thread's parent and records it on its restart row, while the session's pick passes and records none", async () => {
    const db = openCorvidinhoDb({ memory: true });
    cleanups.push(() => db.close());
    const inflight = new InflightReplyStore(db);
    const b = await bridge({ channels: `${PARENT},${OK_THREAD}`, ask: true, db, inflight });
    await b.handlers.onSlash!({
      id: "ix-session",
      commandName: "session",
      subcommand: "start",
      channelId: OK_THREAD,
      userId: OWNER_ID,
      options: { topic: "pick a DB" },
      reply: async () => {},
      deferReply: async () => {},
      editReply: async () => undefined,
      deleteReply: async () => {},
    });
    const session = b.result.store.list()[0]!;
    expect(session.threadId).toBeUndefined();
    const askId = session.pendingAsk?.askId;
    if (!askId) throw new Error("no button ask");

    // The pick: the thread alone, on the run and on its restart row.
    await b.handlers.onComponent!(press(askId, OK_THREAD, OWNER_ID, []));
    expect(b.calls[1]!.sessionId).toBe(session.id);
    expect(b.calls[1]!.replyParentChannelId).toBeUndefined();
    expect(b.rowsAtRun[1]).toEqual([{ channelId: OK_THREAD, parentChannelId: null }]);

    // A reply in the thread to its tracked answer continues it as a message
    // run, which knows the thread's parent.
    const tracked = [...b.result.store.byBotMessageId].find(([, s]) => s.id === session.id)?.[0];
    if (!tracked) throw new Error("no tracked bot message");
    await b.handlers.onMessage(
      msg({ id: "m-reply", threadId: OK_THREAD, mentionedBot: false, content: "more", referencedMessageId: tracked }),
    );
    expect(b.calls).toHaveLength(3);
    expect(b.calls[2]!.sessionId).toBe(session.id);
    expect(b.calls[2]).toMatchObject({ replyChannelId: OK_THREAD, replyParentChannelId: PARENT });
    expect(b.rowsAtRun[2]).toEqual([{ channelId: OK_THREAD, parentChannelId: PARENT }]);
  });
});

describe("discord-post-message gates the id it is given (REQ-discord-212)", () => {
  const KEYS = [
    "CORVIDINHO_ALLOWLIST_FILE",
    "CORVIDINHO_DISCORD_ALLOW_CHANNELS",
    "CORVIDINHO_DISCORD_DENY_CHANNELS",
    "DISCORD_CHANNEL_IDS",
    "DISCORD_TOKEN",
    "DISCORD_BOT_TOKEN",
    "CORVIDINHO_DISCORD_DRY_RUN",
    "CORVIDINHO_ACTING_DISCORD_USER_ID",
    "CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK",
  ] as const;

  async function postWith(
    env: { DISCORD_CHANNEL_IDS: string; CORVIDINHO_DISCORD_DENY_CHANNELS: string },
    channel: string,
  ) {
    const saved = new Map(KEYS.map((k) => [k, process.env[k]] as const));
    for (const k of KEYS) delete process.env[k];
    // A missing file: the loader adds no channels from it.
    process.env.CORVIDINHO_ALLOWLIST_FILE = join(tempDir("corvidinho-thread-deny-post-"), "none.toml");
    process.env.DISCORD_TOKEN = "x";
    process.env.CORVIDINHO_DISCORD_DRY_RUN = "1";
    Object.assign(process.env, env);
    try {
      loadBuiltins();
      return await runPlugin({
        name: "discord-post-message",
        args: ["--channel", channel, "--content", "hi"],
        nonInteractive: true,
        allowlist: ["discord-post-message"],
      });
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  test("a deny-listed thread under an allowlisted parent is refused (is denied), nothing posted", async () => {
    const r = await postWith(
      { DISCORD_CHANNEL_IDS: PARENT, CORVIDINHO_DISCORD_DENY_CHANNELS: THREAD },
      THREAD,
    );
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(3);
    expect(r.error).toContain(`"${THREAD}" is denied`);
  });

  test("a thread allowlisted by its own id posts although its parent is deny-listed (dry run)", async () => {
    for (const channels of [OK_THREAD, `${PARENT},${OK_THREAD}`]) {
      const r = await postWith(
        { DISCORD_CHANNEL_IDS: channels, CORVIDINHO_DISCORD_DENY_CHANNELS: PARENT },
        OK_THREAD,
      );
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.data as { dryRun?: boolean; channelId?: string }).toMatchObject({
        dryRun: true,
        channelId: OK_THREAD,
      });
    }
  });
});
