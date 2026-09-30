/**
 * SAFE-18 (#96, REQ-discord-096) — the gateway never cuts what it sends: a
 * direct message over DISCORD_DM_MAX (1900), or a component reply/update,
 * code-form (modal) submit reply or message edit over Discord's 2000, is
 * refused loudly (sendDm → null, editMessage → false, a reply throws) and
 * nothing goes out; content within the limit goes out whole. Callers split
 * first: answers are defanged before they are split, so the gateway's
 * defang never pushes a part over; the private Choose message is bounded.
 * A fake discord.js module in the real live gateway; no network.
 */
import { describe, expect, test } from "bun:test";
import type * as DiscordJs from "discord.js";
import { emptyConfig } from "../src/allowlist/types.ts";
import { defangMassMentions } from "../src/discord/allowed-mentions.ts";
import { formatAskEphemeralContent } from "../src/discord/ask-buttons.ts";
import { adaptComponent, adaptModalSubmit, createLiveGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { DISCORD_MESSAGE_MAX, planAnswerParts } from "../src/discord/rich-reply.ts";
import type { BridgeConfig } from "../src/discord/types.ts";

/** `DISCORD_DM_MAX` (rich-reply.ts): the gateway's direct-message limit. */
const DISCORD_DM_MAX = 1900;

type Payload = { content?: string | null; components?: unknown[]; flags?: number };

function fakeDiscord() {
  const dms: Payload[] = [];
  const edits: Payload[] = [];
  class FakeClient {
    options: unknown;
    application = null;
    users = {
      fetch: async (id: string) => ({
        send: async (payload: Payload) => {
          dms.push(payload);
          return { id: `dm-msg-${dms.length}`, channelId: `dm-${id}` };
        },
      }),
    };
    channels = {
      fetch: async () => ({
        send: async () => ({ id: "sent" }),
        messages: {
          fetch: async () => ({
            edit: async (payload: Payload) => {
              edits.push(payload);
            },
          }),
        },
      }),
    };
    constructor(options: unknown) {
      this.options = options;
    }
    on() {
      return this;
    }
    async login() {
      return "ok";
    }
    destroy() {}
  }
  const mod = {
    Client: FakeClient,
    GatewayIntentBits: { Guilds: 1, GuildMessages: 512, MessageContent: 32768 },
    Events: { ClientReady: "clientReady", MessageCreate: "messageCreate", InteractionCreate: "interactionCreate", Error: "error" },
    ChannelType: { GuildText: 0, PublicThread: 11, PrivateThread: 12 },
    MessageFlags: { Ephemeral: 64 },
  };
  return { discord: mod as unknown as typeof DiscordJs, dms, edits };
}

function config(): BridgeConfig {
  const allowlist = emptyConfig();
  allowlist.discord.channels = ["chan-1"];
  return {
    token: "fake",
    channelIds: ["chan-1"],
    allowlist,
    corvidinhoBin: "corvidinho",
    projectRoot: "/tmp",
    rateLimitWindowMs: 60_000,
    rateLimitMaxMessages: 10,
    mutedUserIds: [],
    adminUserIds: [],
    adminRoleIds: [],
    requireRequesterCheck: false,
  } as BridgeConfig;
}

async function quiet<T>(fn: () => Promise<T>): Promise<{ out: T; errors: string[] }> {
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => errors.push(a.map(String).join(" "));
  try {
    return { out: await fn(), errors };
  } finally {
    console.error = orig;
  }
}

describe("live gateway: sendDm and editMessage refuse over-limit text, never cut it", () => {
  test("a DM of 1900 goes out whole; 1901 is refused (null), logged, and nothing is sent", async () => {
    const fake = fakeDiscord();
    const handlers: GatewayHandlers = { onMessage: () => {} };
    await createLiveGateway(config(), handlers, { discord: fake.discord });
    const full = "d".repeat(DISCORD_DM_MAX);
    expect(await handlers.sendDm!({ userId: "u1", content: full })).toEqual({ channelId: "dm-u1", messageId: "dm-msg-1" });
    expect(fake.dms[0]!.content).toBe(full);
    const { out, errors } = await quiet(() => handlers.sendDm!({ userId: "u1", content: `${full}x` }));
    expect(out).toBeNull();
    expect(fake.dms).toHaveLength(1);
    expect(errors.join()).toContain("sendDm: 1901 characters is over the 1900-character limit");
    // The defang is counted: 1900 characters ending in @everyone send 1901.
    const edge = `${"d".repeat(DISCORD_DM_MAX - 9)}@everyone`;
    expect(edge).toHaveLength(DISCORD_DM_MAX);
    const { out: defanged } = await quiet(() => handlers.sendDm!({ userId: "u1", content: edge }));
    expect(defanged).toBeNull();
    expect(fake.dms).toHaveLength(1);
  });

  test("an edit of 2000 goes out whole; 2001 is refused (false) and nothing is edited", async () => {
    const fake = fakeDiscord();
    const handlers: GatewayHandlers = { onMessage: () => {} };
    await createLiveGateway(config(), handlers, { discord: fake.discord });
    const full = "e".repeat(DISCORD_MESSAGE_MAX);
    expect(await handlers.editMessage!({ channelId: "c", messageId: "m", content: full })).toBe(true);
    expect(fake.edits[0]!.content).toBe(full);
    const { out } = await quiet(() => handlers.editMessage!({ channelId: "c", messageId: "m", content: `${full}e` }));
    expect(out).toBe(false);
    expect(fake.edits).toHaveLength(1);
  });
});

describe("component and code-form replies refuse over-limit text, never cut it", () => {
  function componentFixture() {
    const calls: Array<{ kind: string; payload: Payload }> = [];
    const raw = {
      id: "i1",
      customId: "cvok:forget:approve:fr_1",
      channelId: "dm-1",
      guildId: null,
      user: { id: "u1" },
      message: { id: "card-1" },
      deferred: false,
      replied: false,
      reply: async (p: Payload) => void calls.push({ kind: "reply", payload: p }),
      update: async (p: Payload) => void calls.push({ kind: "update", payload: p }),
    };
    return { calls, ix: adaptComponent(raw as never) };
  }

  test("a card update of 2000 goes out whole; 2001 throws and nothing is sent", async () => {
    const { calls, ix } = componentFixture();
    await ix.reply({ content: "u".repeat(DISCORD_MESSAGE_MAX), components: [], update: true });
    expect(calls[0]!.kind).toBe("update");
    expect(calls[0]!.payload.content).toHaveLength(DISCORD_MESSAGE_MAX);
    const { out } = await quiet(async () => {
      try {
        await ix.reply({ content: "u".repeat(DISCORD_MESSAGE_MAX + 1), update: true });
        return null;
      } catch (err) {
        return err;
      }
    });
    expect((out as Error | null)?.name).toBe("DiscordContentTooLongError");
    expect(calls).toHaveLength(1);
  });

  test("a code-form submit reply over 2000 throws and nothing is sent", async () => {
    const calls: Payload[] = [];
    const ix = adaptModalSubmit({
      id: "m1",
      customId: "cvok:forget:submit:fr_1",
      channelId: "dm-1",
      guildId: null,
      user: { id: "u1" },
      message: { id: "card-1" },
      fields: { fields: { values: () => [{ type: 4, customId: "code", value: "ABCD2345" }] } },
      deferred: false,
      replied: false,
      reply: async (p: unknown) => void calls.push(p as Payload),
    } as never);
    expect(ix.modalValues).toEqual({ code: "ABCD2345" });
    await ix.reply({ content: "r".repeat(DISCORD_MESSAGE_MAX), ephemeral: true });
    expect(calls[0]!.content).toHaveLength(DISCORD_MESSAGE_MAX);
    expect(calls[0]!.flags).toBe(64);
    const { out } = await quiet(async () => {
      try {
        await ix.reply({ content: "r".repeat(DISCORD_MESSAGE_MAX + 1), ephemeral: true });
        return null;
      } catch (err) {
        return err;
      }
    });
    expect((out as Error | null)?.name).toBe("DiscordContentTooLongError");
    expect(calls).toHaveLength(1);
  });
});

describe("callers split or bound first, so the refusal never bites them", () => {
  test("answer parts are defanged before they are split: every part stays within 2000 after the gateway's defang", () => {
    const text = `${"a".repeat(1995)} @everyone ${"b".repeat(500)} @here`;
    const parts = planAnswerParts(text, { footer: null });
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(defangMassMentions(p.content!)).toBe(p.content!);
      expect(p.content!.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
    }
  });

  test("the private Choose message of a question with many short lines stays under Discord's limit, cut visibly", () => {
    const question = Array.from({ length: 600 }, () => "a").join("\n\n");
    const text = formatAskEphemeralContent({ question, options: [{ id: "1", label: "x" }] } as never);
    expect(text.length).toBeLessThanOrEqual(1900);
    expect(text.endsWith("…")).toBe(true);
  });
});
