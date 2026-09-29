/**
 * REQ-discord-205 — outbound mention safety (DISCORD-8 confused deputy,
 * ROLES-CHAT-3/8). Model-written text steered to contain `@everyone`,
 * `@here`, `<@&role>` or `<@user>` must never ping from any bridge outbound
 * path: chat mention / reply-continue, `/session start` and `/work` answers
 * (collapsed edit or editReply fallback), ask-button replies, schedule posts,
 * thinking embeds, and the agent's `discord-post-message`. Fixtures only: a
 * fake discord.js module injected into the real live gateway, a stubbed
 * fetch — no live Discord, no network, no git worktrees.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type * as DiscordJs from "discord.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanAsk } from "../src/agent/types.ts";
import { emptyConfig } from "../src/allowlist/types.ts";
import type { AgentClient } from "../src/discord/agent-client.ts";
import {
  defangMassMentions,
  outboundAllowedMentions,
} from "../src/discord/allowed-mentions.ts";
import { startBridge } from "../src/discord/bridge.ts";
import {
  createLiveGateway,
  type GatewayHandlers,
} from "../src/discord/gateway.ts";
import type { BridgeConfig } from "../src/discord/types.ts";
import { loadBuiltins } from "../src/plugins/builtins.ts";
import { runPlugin } from "../src/plugins/run.ts";
import { SchedulerService } from "../src/scheduler/service.ts";
import { ScheduleStore } from "../src/scheduler/store.ts";

const BOT_ID = "100000000000000001";
const USER_ID = "200000000000000002";
const OWNER_ID = "111122223333444455";
const ROLE_ID = "300000000000000003";
const OTHER_ID = "400000000000000004";

/** What untrusted input steers a model summary into. */
const MARK = "Summary done.";
const HOSTILE = `${MARK} @everyone @here <@&${ROLE_ID}> <@${OTHER_ID}> <@!${OTHER_ID}> please look`;

type Payload = {
  content?: string | null;
  embeds?: unknown[];
  allowedMentions?: {
    parse?: string[];
    roles?: string[];
    users?: string[];
    repliedUser?: boolean;
  };
};

/**
 * The post parses nothing from its text: no `@everyone` / `@here`, role or
 * user ping; at most the users in `mayPing` (an ask's named users).
 */
function expectSafe(p: Payload, mayPing: string[] = []) {
  expect(p.allowedMentions).toBeDefined();
  expect(p.allowedMentions!.parse).toEqual([]);
  expect(p.allowedMentions!.roles).toBeUndefined();
  for (const u of p.allowedMentions!.users ?? []) expect(mayPing).toContain(u);
  if (typeof p.content === "string") {
    expect(p.content).not.toMatch(/@(everyone|here)\b/i);
  }
}

type Call = { kind: string; payload: Payload };

/** Minimal discord.js stand-in: records every outbound payload. */
function fakeDiscord() {
  const sends: Array<{ channelId: string; id: string; payload: Payload }> = [];
  const edits: Array<{ channelId: string; messageId: string; payload: Payload }> = [];
  const box: { client: FakeClient | null } = { client: null };

  class FakeClient {
    options: { allowedMentions?: Payload["allowedMentions"] };
    application = null;
    private listeners = new Map<string, Array<(arg: unknown) => void>>();
    channels = {
      fetch: async (channelId: string) => ({
        id: channelId,
        send: async (payload: Payload) => {
          const id = `sent_${sends.length + 1}`;
          sends.push({ channelId, id, payload });
          return { id };
        },
        messages: {
          fetch: async (messageId: string) => ({
            edit: async (payload: Payload) => {
              edits.push({ channelId, messageId, payload });
            },
            delete: async () => {},
          }),
        },
      }),
    };
    constructor(options: FakeClient["options"]) {
      this.options = options;
      box.client = this;
    }
    on(event: string, fn: (arg: unknown) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(fn);
      this.listeners.set(event, list);
      return this;
    }
    emit(event: string, arg: unknown) {
      for (const fn of this.listeners.get(event) ?? []) fn(arg);
    }
    async login() {
      return "ok";
    }
    destroy() {}
  }

  const mod = {
    Client: FakeClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 512, MessageContent: 32768 },
    Events: {
      ClientReady: "clientReady",
      MessageCreate: "messageCreate",
      InteractionCreate: "interactionCreate",
      Error: "error",
    },
    ChannelType: { GuildText: 0, PublicThread: 11, PrivateThread: 12 },
    MessageFlags: { Ephemeral: 64 },
  };
  return {
    discord: mod as unknown as typeof DiscordJs,
    sends,
    edits,
    client: () => box.client!,
    /** Every channel send and message edit payload, in order. */
    payloads: (): Payload[] => [
      ...sends.map((s) => s.payload),
      ...edits.map((e) => e.payload),
    ],
  };
}

function bridgeConfig(): BridgeConfig {
  const allowlist = emptyConfig();
  allowlist.discord.channels = ["chan-1"];
  return {
    token: "fake",
    channelIds: ["chan-1"],
    allowlist,
    corvidinhoBin: "corvidinho",
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-mentions-proj-")),
    rateLimitWindowMs: 60_000,
    rateLimitMaxMessages: 10,
    mutedUserIds: [],
    adminUserIds: [],
    adminRoleIds: [],
    requireRequesterCheck: false,
  };
}

async function waitFor(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function summaryAgent(summary: string, ask?: HumanAsk): AgentClient {
  return {
    async runChat({ sessionId }) {
      return { ok: true, sessionId, summary, exitCode: 0, ...(ask ? { ask } : {}) };
    },
  };
}

/** Slash (chat input) interaction fixture; records reply/editReply payloads. */
function slashInteraction(commandName: string, sub: string | null, opts: Record<string, string>) {
  const calls: Call[] = [];
  const optionData = Object.entries(opts).map(([name, value]) => ({ name, type: 3, value }));
  const i = {
    id: `i-${commandName}`,
    commandName,
    channelId: "chan-1",
    guildId: "guild-1",
    user: { id: USER_ID, username: "chatter" },
    member: null,
    options: {
      getSubcommand: () => sub,
      getSubcommandGroup: () => null,
      data: sub ? [{ name: sub, type: 1, options: optionData }] : optionData,
    },
    deferred: false,
    replied: false,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isChatInputCommand: () => true,
    async deferReply(payload: Payload) {
      calls.push({ kind: "deferReply", payload });
      i.deferred = true;
    },
    async reply(payload: Payload) {
      calls.push({ kind: "reply", payload });
      i.replied = true;
    },
    async editReply(payload: Payload) {
      calls.push({ kind: "editReply", payload });
      return { id: `reply-${commandName}` };
    },
    async deleteReply() {
      calls.push({ kind: "deleteReply", payload: {} });
    },
  };
  return { i, calls };
}

describe("outboundAllowedMentions / defangMassMentions", () => {
  test("parses nothing; only listed users (deduped) and the replied-to author", () => {
    expect(outboundAllowedMentions()).toEqual({ parse: [] });
    expect(outboundAllowedMentions({ repliedUser: true })).toEqual({
      parse: [],
      repliedUser: true,
    });
    expect(
      outboundAllowedMentions({ users: [OWNER_ID, OWNER_ID, ""], repliedUser: true }),
    ).toEqual({ parse: [], users: [OWNER_ID], repliedUser: true });
    expect(outboundAllowedMentions({ users: [] })).toEqual({ parse: [] });
    // Fresh object per call: one payload can never mutate another's.
    expect(outboundAllowedMentions()).not.toBe(outboundAllowedMentions());
  });

  test("defang breaks @everyone / @here and is idempotent", () => {
    const once = defangMassMentions("hi @everyone and @HERE");
    expect(once).not.toMatch(/@(everyone|here)\b/i);
    expect(once).toBe("hi @​everyone and @​HERE");
    expect(defangMassMentions(once)).toBe(once);
    expect(defangMassMentions("mail a@example.com")).toBe("mail a@example.com");
  });
});

describe("live gateway parses no mentions from outbound text (REQ-discord-205)", () => {
  async function gateway(extra: Partial<GatewayHandlers> = {}) {
    const fake = fakeDiscord();
    const handlers: GatewayHandlers = { onMessage: () => {}, ...extra };
    const gw = await createLiveGateway(bridgeConfig(), handlers, { discord: fake.discord });
    return { fake, handlers, gw };
  }

  test("client default allows no parsed mentions (replied-to author only)", async () => {
    const { fake } = await gateway();
    expect(fake.client().options.allowedMentions).toEqual({
      parse: [],
      repliedUser: true,
    });
  });

  test("plain reply (chat, schedule, announce, refusal) pings nobody from its text", async () => {
    const { fake, handlers } = await gateway();
    await handlers.reply!({ channelId: "chan-1", content: HOSTILE, replyToMessageId: "m1" });
    await handlers.reply!({ channelId: "chan-1", content: HOSTILE });
    expect(fake.sends).toHaveLength(2);
    for (const { payload } of fake.sends) {
      expectSafe(payload);
      expect(payload.allowedMentions!.users).toBeUndefined();
      expect(payload.allowedMentions!.repliedUser).toBe(true);
      // Role/user syntax stays visible text; it just cannot ping.
      expect(payload.content).toContain(`<@&${ROLE_ID}>`);
    }
  });

  test("an ask keeps exactly the users it names, nothing from its text", async () => {
    const { fake, handlers } = await gateway();
    await handlers.reply!({
      channelId: "chan-1",
      content: `❓ question <@${OWNER_ID}> ${HOSTILE}`,
      replyToMessageId: "m1",
      mentionUserIds: [OWNER_ID],
    });
    expectSafe(fake.sends[0]!.payload, [OWNER_ID]);
    expect(fake.sends[0]!.payload.allowedMentions!.users).toEqual([OWNER_ID]);
    // Empty list ⇒ nobody besides the replied-to author.
    await handlers.reply!({ channelId: "chan-1", content: HOSTILE, mentionUserIds: [] });
    expectSafe(fake.sends[1]!.payload);
    expect(fake.sends[1]!.payload.allowedMentions!.users).toBeUndefined();
  });

  test("editMessage (collapsed answer) parses no mentions; keeps only named users", async () => {
    const { fake, handlers } = await gateway();
    await handlers.editMessage!({ channelId: "chan-1", messageId: "t1", content: HOSTILE });
    await handlers.editMessage!({
      channelId: "chan-1",
      messageId: "t1",
      content: HOSTILE,
      mentionUserIds: [USER_ID],
    });
    await handlers.editMessage!({ channelId: "chan-1", messageId: "t1", content: null, components: null });
    expectSafe(fake.edits[0]!.payload);
    expect(fake.edits[0]!.payload.allowedMentions!.users).toBeUndefined();
    expectSafe(fake.edits[1]!.payload, [USER_ID]);
    expect(fake.edits[1]!.payload.allowedMentions!.users).toEqual([USER_ID]);
    expectSafe(fake.edits[2]!.payload);
    expect(fake.edits[2]!.payload.content).toBeNull();
  });

  test("thinking embeds send and edit with no parsed mentions", async () => {
    const { fake, handlers } = await gateway();
    const embed = { description: HOSTILE, color: 1 };
    await handlers.sendEmbed!({ channelId: "chan-1", embed, replyToMessageId: "m1" });
    await handlers.editEmbed!({ channelId: "chan-1", messageId: "sent_1", embed });
    expectSafe(fake.sends[0]!.payload);
    expectSafe(fake.edits[0]!.payload);
  });

  test("content is capped after defang (Discord 2000 limit)", async () => {
    const { fake, handlers } = await gateway();
    await handlers.reply!({ channelId: "chan-1", content: "@everyone ".repeat(400) });
    expect(fake.sends[0]!.payload.content!.length).toBeLessThanOrEqual(2000);
    expectSafe(fake.sends[0]!.payload);
  });

  test("slash reply, deferred editReply fallback: no parsed mentions", async () => {
    const { fake, gw } = await gateway({
      onSlash: async (s) => {
        if (s.commandName === "status") {
          await s.reply({ content: HOSTILE, ephemeral: true });
        } else {
          await s.deferReply?.({ ephemeral: false });
          await s.editReply!({ content: HOSTILE });
        }
      },
    });
    await gw.start();
    const status = slashInteraction("status", null, {});
    const work = slashInteraction("work", null, { description: "x" });
    fake.client().emit("interactionCreate", status.i);
    fake.client().emit("interactionCreate", work.i);
    await waitFor(
      () =>
        status.calls.some((c) => c.kind === "reply") &&
        work.calls.some((c) => c.kind === "editReply"),
      "slash replies",
    );
    expectSafe(status.calls.find((c) => c.kind === "reply")!.payload);
    const edit = work.calls.find((c) => c.kind === "editReply")!.payload;
    expectSafe(edit);
    expect(edit.content).toContain(MARK);
    await gw.stop();
  });

  test("ask-button component reply and update: no parsed mentions", async () => {
    const { fake, gw } = await gateway({
      onComponent: async (c) => {
        await c.reply({ content: HOSTILE, ephemeral: true });
        await c.reply({ content: HOSTILE, update: true, components: [] });
      },
    });
    await gw.start();
    const calls: Call[] = [];
    fake.client().emit("interactionCreate", {
      id: "c1",
      customId: "ask:choose:x",
      channelId: "chan-1",
      guildId: "guild-1",
      user: { id: USER_ID, username: "chatter" },
      member: null,
      message: { id: "stub-1" },
      deferred: false,
      replied: false,
      isAutocomplete: () => false,
      isMessageComponent: () => true,
      isChatInputCommand: () => false,
      reply: async (payload: Payload) => void calls.push({ kind: "reply", payload }),
      update: async (payload: Payload) => void calls.push({ kind: "update", payload }),
    });
    await waitFor(() => calls.length === 2, "component reply + update");
    for (const c of calls) expectSafe(c.payload);
    expect(calls.map((c) => c.kind)).toEqual(["reply", "update"]);
    await gw.stop();
  });
});

describe("bridge outbound paths with model text (REQ-discord-205)", () => {
  async function liveBridge(agent: AgentClient) {
    const fake = fakeDiscord();
    const box: { handlers: GatewayHandlers | null } = { handlers: null };
    const result = await startBridge({
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "chan-1",
        CORVIDINHO_DISCORD_DRY_RUN: "1",
        CORVIDINHO_OWNER_DISCORD_ID: OWNER_ID,
        // Env-only config: never read a real allowlist file from $HOME.
        CORVIDINHO_ALLOWLIST_FILE: join(
          mkdtempSync(join(tmpdir(), "corvidinho-mentions-")),
          "none.toml",
        ),
      },
      // Temp non-git project: never create real worktrees in this repo.
      projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-mentions-proj-")),
      skipProtocolCheck: true,
      disableScheduler: true,
      thinkingDebounceMs: 0,
      thinkingTickMs: 60_000,
      agent,
      // The real live gateway on a fake discord.js: thinking embeds, the
      // collapsed answer edit and any reply all go through its send/edit.
      gatewayFactory: async (cfg, handlers) => {
        box.handlers = handlers;
        return createLiveGateway(cfg, handlers, { discord: fake.discord });
      },
    });
    if (!result.ok || !box.handlers) throw new Error("bridge did not start");
    fake.client().emit("clientReady", {
      user: { id: BOT_ID, tag: "corvidinho#0001", setPresence: () => {} },
    });
    return { result, fake };
  }

  function message(id: string, content: string, reference?: string) {
    return {
      id,
      channelId: "chan-1",
      guildId: "guild-1",
      channel: { type: 0 },
      author: { id: USER_ID, bot: false, username: "chatter", globalName: "Chatter" },
      member: { displayName: "Chatter", roles: { cache: new Map<string, unknown>() } },
      content,
      mentions: { users: new Map(reference ? [] : [[BOT_ID, {}]]) },
      reference: reference ? { messageId: reference, channelId: "chan-1" } : null,
      attachments: new Map(),
    };
  }

  const answers = (ps: Payload[]) =>
    ps.filter((p) => typeof p.content === "string" && p.content.includes(MARK));

  /** Message id that carries the answer (collapsed edit or a fresh send). */
  function answerMessageId(fake: ReturnType<typeof fakeDiscord>): string {
    const edit = fake.edits.find((e) => answers([e.payload]).length > 0);
    if (edit) return edit.messageId;
    return fake.sends.find((s) => answers([s.payload]).length > 0)!.id;
  }

  test("@mention and reply-continue: summary with @everyone / role / user pings nobody", async () => {
    const { result, fake } = await liveBridge(summaryAgent(HOSTILE));

    fake.client().emit("messageCreate", message("m1", `<@${BOT_ID}> summarize issue 1`));
    await waitFor(() => answers(fake.payloads()).length >= 1, "mention answer");
    const first = answers(fake.payloads()).length;
    expect(answers(fake.payloads())[0]!.content).toContain(`<@&${ROLE_ID}>`);

    // DISCORD-2: replying to the bot's answer continues the same session.
    fake.client().emit("messageCreate", message("m2", "and again", answerMessageId(fake)));
    await waitFor(() => answers(fake.payloads()).length > first, "reply-continue answer");

    // Every outbound payload — thinking embeds, collapsed edits, replies.
    expect(fake.payloads().length).toBeGreaterThan(2);
    for (const p of fake.payloads()) expectSafe(p);
    await result.stop();
  });

  test("a clarify ask pings only the requester it names, nothing from its text", async () => {
    const ask: HumanAsk = {
      reason: "clarify",
      question: `Pick one @everyone <@&${ROLE_ID}> <@${OTHER_ID}>`,
    };
    const { result, fake } = await liveBridge(summaryAgent("state=blocked", ask));
    fake.client().emit("messageCreate", message("m1", `<@${BOT_ID}> add storage`));
    await waitFor(
      () => fake.payloads().some((p) => (p.allowedMentions?.users ?? []).includes(USER_ID)),
      "requester ping",
    );
    for (const p of fake.payloads()) expectSafe(p, [USER_ID]);
    await result.stop();
  });

  for (const [name, command, sub, opts] of [
    ["/session start", "session", "start", { topic: "look at issue 1" }],
    ["/work", "work", null, { description: "fix the docs @everyone" }],
  ] as const) {
    test(`${name} answer pings nobody from the summary`, async () => {
      const { result, fake } = await liveBridge(summaryAgent(HOSTILE));
      const { i, calls } = slashInteraction(command, sub, { ...opts });
      fake.client().emit("interactionCreate", i);
      const all = () => [
        ...fake.payloads(),
        ...calls.filter((c) => c.kind === "reply" || c.kind === "editReply").map((c) => c.payload),
      ];
      await waitFor(() => answers(all()).length >= 1, `${name} answer`);
      expect(answers(all())[0]!.content).toContain(`<@&${ROLE_ID}>`);
      for (const p of all()) expectSafe(p);
      await result.stop();
    });
  }
});

describe("schedule tick post pings nobody from the summary (REQ-discord-205)", () => {
  test("no-ask tick through the live gateway reply", async () => {
    const fake = fakeDiscord();
    const handlers: GatewayHandlers = { onMessage: () => {} };
    await createLiveGateway(bridgeConfig(), handlers, { discord: fake.discord });

    const store = new ScheduleStore();
    const past = Date.now() - 60_000;
    const s = store.create({
      name: "Nightly",
      cronExpression: "0 * * * *",
      project: "proj-a",
      prompt: "summarize",
      createdByUserId: "admin",
      channelId: "chan-1",
      now: past - 3_600_000,
    });
    s.nextRunAt = past;
    const allowlist = emptyConfig();
    allowlist.discord.channels = ["chan-1"];
    const svc = new SchedulerService({
      store,
      agent: summaryAgent(HOSTILE),
      allowlist,
      manual: true,
      useWorktrees: false,
      owner: { discordId: OWNER_ID },
      // Same wiring as the bridge: post → gateway reply.
      outbound: {
        post: async ({ channelId, content, mentionUserIds }) => {
          await handlers.reply!({ channelId, content, mentionUserIds });
        },
      },
    });
    await svc.tick();
    await waitFor(() => svc.runningIds().length === 0, "schedule run");
    svc.stop();

    expect(fake.sends).toHaveLength(1);
    expect(fake.sends[0]!.payload.content).toContain("Schedule **Nightly**");
    expect(fake.sends[0]!.payload.content).toContain(`<@&${ROLE_ID}>`);
    expectSafe(fake.sends[0]!.payload);
  });
});

describe("discord-post-message parses no mentions (REQ-discord-205)", () => {
  const saved: Record<string, string | undefined> = {};
  const realFetch = globalThis.fetch;
  const keys = [
    "CORVIDINHO_DISCORD_ALLOW_CHANNELS",
    "CORVIDINHO_ALLOWLIST_FILE",
    "DISCORD_TOKEN",
    "CORVIDINHO_DISCORD_DRY_RUN",
    "CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK",
    "CORVIDINHO_ACTING_DISCORD_USER_ID",
  ];

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of keys) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  });

  test("REST body sends allowed_mentions.parse = [] and defanged text", async () => {
    for (const k of keys) saved[k] = process.env[k];
    process.env.CORVIDINHO_DISCORD_ALLOW_CHANNELS = "999";
    process.env.CORVIDINHO_ALLOWLIST_FILE = join(
      mkdtempSync(join(tmpdir(), "corvidinho-mentions-post-")),
      "none.toml",
    );
    process.env.DISCORD_TOKEN = "fake";
    delete process.env.CORVIDINHO_DISCORD_DRY_RUN;
    delete process.env.CORVIDINHO_DISCORD_REQUIRE_REQUESTER_CHECK;
    // Operator run (no bridge actor): the post goes straight to the API.
    delete process.env.CORVIDINHO_ACTING_DISCORD_USER_ID;

    const bodies: Array<{ content: string; allowed_mentions?: { parse?: string[] } }> = [];
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "posted-1" }), { status: 200 });
    }) as unknown as typeof fetch;

    loadBuiltins();
    const r = await runPlugin({
      name: "discord-post-message",
      args: ["--channel", "999", "--content", HOSTILE],
      nonInteractive: true,
      allowlist: ["discord-post-message"],
    });
    expect(r.ok).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.allowed_mentions).toEqual({ parse: [] });
    expect(bodies[0]!.content).not.toMatch(/@(everyone|here)\b/i);
    expect(bodies[0]!.content).toContain(`<@&${ROLE_ID}>`);
  });
});
