import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { loadBridgeConfig } from "../src/discord/config.ts";
import { routeMessage } from "../src/discord/message-router.ts";
import {
  checkRateLimit,
  defaultRateLimitConfig,
  gateRateOrMute,
  isMuted,
  muteUser,
  unmuteUser,
  type RateLimitState,
} from "../src/discord/permissions.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type { SlashContext, SlashInteraction } from "../src/discord/slash-types.ts";
import {
  EPHEMERAL_SILENT_ACK,
  MUTED,
  NOT_AUTHORIZED,
  RATE_LIMITED,
  type InboundMessage,
} from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";

function baseMsg(over: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "m1",
    channelId: "chan-allowed",
    authorId: "user-1",
    authorBot: false,
    content: "hello <@bot>",
    mentionedBot: true,
    ...over,
  };
}

function allowCfg(channels: string[] = ["chan-allowed"]) {
  const cfg = emptyConfig();
  cfg.discord.channels = channels.map((c) => c.toLowerCase());
  return cfg;
}

function freshRate(): { state: RateLimitState; config: ReturnType<typeof defaultRateLimitConfig> } {
  return {
    state: { userMessageTimestamps: new Map() },
    config: defaultRateLimitConfig({ windowMs: 60_000, maxMessages: 3 }),
  };
}

describe("checkRateLimit (DISCORD-6)", () => {
  test("allows under max and records timestamps", () => {
    const { state, config } = freshRate();
    expect(checkRateLimit(state, "u1", config, undefined, 1000)).toBe(true);
    expect(state.userMessageTimestamps.get("u1")?.length).toBe(1);
  });

  test("refuses at max within window", () => {
    const { state, config } = freshRate();
    const t0 = 10_000;
    expect(checkRateLimit(state, "u1", config, undefined, t0)).toBe(true);
    expect(checkRateLimit(state, "u1", config, undefined, t0 + 1)).toBe(true);
    expect(checkRateLimit(state, "u1", config, undefined, t0 + 2)).toBe(true);
    expect(checkRateLimit(state, "u1", config, undefined, t0 + 3)).toBe(false);
  });

  test("prunes timestamps outside window then allows", () => {
    const { state, config } = freshRate();
    // Fill to max at t=0
    checkRateLimit(state, "u1", config, undefined, 0);
    checkRateLimit(state, "u1", config, undefined, 1);
    checkRateLimit(state, "u1", config, undefined, 2);
    expect(checkRateLimit(state, "u1", config, undefined, 3)).toBe(false);
    // After window elapses, old stamps drop
    expect(checkRateLimit(state, "u1", config, undefined, 60_000 + 10)).toBe(true);
  });

  test("rateLimitByLevel override applies to matching level", () => {
    const state: RateLimitState = { userMessageTimestamps: new Map() };
    const config = defaultRateLimitConfig({
      windowMs: 60_000,
      maxMessages: 10,
      rateLimitByLevel: { 1: 2 },
    });
    checkRateLimit(state, "u1", config, 1, 100);
    checkRateLimit(state, "u1", config, 1, 101);
    expect(checkRateLimit(state, "u1", config, 1, 102)).toBe(false);
    // Different level uses default max 10 — fresh user
    expect(checkRateLimit(state, "u2", config, 2, 100)).toBe(true);
  });

  test("limiting user A does not affect user B", () => {
    const { state, config } = freshRate();
    config.maxMessages = 1;
    expect(checkRateLimit(state, "a", config, undefined, 1)).toBe(true);
    expect(checkRateLimit(state, "a", config, undefined, 2)).toBe(false);
    expect(checkRateLimit(state, "b", config, undefined, 2)).toBe(true);
  });
});

describe("muteUser / unmuteUser (DISCORD-6)", () => {
  test("mute adds; unmute removes; isMuted reflects", () => {
    const muted = new Set<string>();
    muteUser(muted, "u1");
    expect(isMuted(muted, "u1")).toBe(true);
    unmuteUser(muted, "u1");
    expect(isMuted(muted, "u1")).toBe(false);
  });

  test("mute is idempotent; unmute missing is no-op", () => {
    const muted = new Set<string>();
    muteUser(muted, "u1");
    muteUser(muted, "u1");
    expect(muted.size).toBe(1);
    unmuteUser(muted, "nobody");
    expect(muted.size).toBe(1);
  });

  test("gateRateOrMute refuses muted then rate-limited", () => {
    const muted = new Set<string>(["bad"]);
    const rate = freshRate();
    rate.config.maxMessages = 1;
    expect(gateRateOrMute({ userId: "bad", mutedUsers: muted }).ok).toBe(false);
    expect(gateRateOrMute({ userId: "ok", mutedUsers: muted }).ok).toBe(true);
    expect(
      gateRateOrMute({
        userId: "ok",
        rateLimit: { state: rate.state, config: rate.config },
        nowMs: 1,
      }).ok,
    ).toBe(true);
    const second = gateRateOrMute({
      userId: "ok",
      rateLimit: { state: rate.state, config: rate.config },
      nowMs: 2,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reply).toBe(RATE_LIMITED);
  });
});

describe("message-router mute + rate limit", () => {
  test("muted user mention is refused; peer still starts", () => {
    const store = new SessionStore();
    const muted = new Set(["user-muted"]);
    const refused = routeMessage(baseMsg({ authorId: "user-muted" }), {
      store,
      allowlist: allowCfg(),
      mutedUsers: muted,
    });
    expect(refused.kind).toBe("refuse");
    if (refused.kind === "refuse") {
      expect(refused.reason).toBe("muted");
      expect(refused.reply).toBe(MUTED);
    }
    expect(store.bySessionId.size).toBe(0);

    const ok = routeMessage(baseMsg({ id: "m2", authorId: "user-ok" }), {
      store,
      allowlist: allowCfg(),
      mutedUsers: muted,
    });
    expect(ok.kind).toBe("start_session");
  });

  test("rate-limited user refused; peer unaffected", () => {
    const store = new SessionStore();
    const rate = freshRate();
    rate.config.maxMessages = 1;
    const first = routeMessage(baseMsg({ id: "m1", authorId: "hot" }), {
      store,
      allowlist: allowCfg(),
      rateLimit: { state: rate.state, config: rate.config },
      nowMs: 1000,
    });
    expect(first.kind).toBe("start_session");

    const limited = routeMessage(baseMsg({ id: "m2", authorId: "hot" }), {
      store,
      allowlist: allowCfg(),
      rateLimit: { state: rate.state, config: rate.config },
      nowMs: 1001,
    });
    expect(limited.kind).toBe("refuse");
    if (limited.kind === "refuse") {
      expect(limited.reason).toBe("rate_limited");
      expect(limited.reply).toBe(RATE_LIMITED);
    }

    const peer = routeMessage(baseMsg({ id: "m3", authorId: "cool" }), {
      store,
      allowlist: allowCfg(),
      rateLimit: { state: rate.state, config: rate.config },
      nowMs: 1001,
    });
    expect(peer.kind).toBe("start_session");
  });

  test("reply continue path also respects mute", () => {
    const store = new SessionStore();
    const muted = new Set<string>();
    const start = routeMessage(baseMsg({ id: "m-start" }), {
      store,
      allowlist: allowCfg(),
      mutedUsers: muted,
    });
    expect(start.kind).toBe("start_session");
    if (start.kind !== "start_session") return;
    store.trackBotMessage("bot-msg-1", start.session);
    muteUser(muted, "user-1");

    const cont = routeMessage(
      baseMsg({
        id: "m-reply",
        mentionedBot: false,
        content: "follow up",
        referencedMessageId: "bot-msg-1",
      }),
      { store, allowlist: allowCfg(), mutedUsers: muted },
    );
    expect(cont.kind).toBe("refuse");
    if (cont.kind === "refuse") expect(cont.reason).toBe("muted");
  });
});

describe("slash-dispatch mute + rate limit", () => {
  function memInteraction(
    over: Partial<SlashInteraction> & { commandName: string },
  ): SlashInteraction & { replies: string[] } {
    const replies: string[] = [];
    return {
      id: "i1",
      channelId: "chan-allowed",
      userId: "user-1",
      options: {},
      replies,
      reply: async ({ content }) => {
        if (content) replies.push(content);
      },
      ...over,
    };
  }

  function baseCtx(over: Partial<SlashContext> = {}): SlashContext {
    return {
      store: new SessionStore(),
      workStore: new WorkStore(),
      allowlist: allowCfg(),
      agent: createEchoAgentClient(),
      version: "0.0.1",
      protocolVersion: 1,
      startedAt: Date.now(),
      channelIds: ["chan-allowed"],
      ...over,
    };
  }

  test("channel deny still wins before mute", async () => {
    const muted = new Set(["user-1"]);
    const ix = memInteraction({ commandName: "status", channelId: "other" });
    const r = await handleSlashInteraction(baseCtx({ mutedUsers: muted }), ix);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("channel_not_allowlisted");
    expect(ix.replies[0]).toBe(EPHEMERAL_SILENT_ACK);
  });

  test("muted user slash refused; peer ok", async () => {
    const muted = new Set(["user-muted"]);
    const rate = freshRate();
    const ctx = baseCtx({
      mutedUsers: muted,
      rateLimitState: rate.state,
      rateLimitConfig: rate.config,
    });
    const bad = memInteraction({ commandName: "status", userId: "user-muted" });
    const rBad = await handleSlashInteraction(ctx, bad);
    expect(rBad.ok).toBe(false);
    if (!rBad.ok) expect(rBad.reason).toBe("muted");
    expect(bad.replies[0]).toBe(MUTED);

    const good = memInteraction({ commandName: "status", userId: "user-ok", id: "i2" });
    const rGood = await handleSlashInteraction(ctx, good);
    expect(rGood.ok).toBe(true);
  });

  test("rate-limited slash refused for same user only", async () => {
    const rate = freshRate();
    rate.config.maxMessages = 1;
    const ctx = baseCtx({
      rateLimitState: rate.state,
      rateLimitConfig: rate.config,
    });
    const first = memInteraction({ commandName: "status", userId: "hot" });
    expect((await handleSlashInteraction(ctx, first)).ok).toBe(true);

    const second = memInteraction({ commandName: "status", userId: "hot", id: "i2" });
    const r2 = await handleSlashInteraction(ctx, second);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("rate_limited");
    expect(second.replies[0]).toBe(RATE_LIMITED);

    const peer = memInteraction({ commandName: "status", userId: "cool", id: "i3" });
    expect((await handleSlashInteraction(ctx, peer)).ok).toBe(true);
  });
});

describe("config env knobs for rate/mute", () => {
  test("defaults and overrides load", async () => {
    const def = await loadBridgeConfig({
      env: {
        DISCORD_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "111",
      },
      filePath: null,
    });
    expect(def.ok).toBe(true);
    if (def.ok) {
      expect(def.config.rateLimitWindowMs).toBe(60_000);
      expect(def.config.rateLimitMaxMessages).toBe(10);
      expect(def.config.mutedUserIds).toEqual([]);
    }

    const over = await loadBridgeConfig({
      env: {
        DISCORD_TOKEN: "fake",
        DISCORD_CHANNEL_IDS: "111",
        DISCORD_RATE_LIMIT_WINDOW_MS: "30000",
        DISCORD_RATE_LIMIT_MAX: "5",
        DISCORD_MUTED_USER_IDS: "aaa, bbb",
        DISCORD_RATE_LIMIT_BY_LEVEL: '{"1":2,"2":20}',
      },
      filePath: null,
    });
    expect(over.ok).toBe(true);
    if (over.ok) {
      expect(over.config.rateLimitWindowMs).toBe(30_000);
      expect(over.config.rateLimitMaxMessages).toBe(5);
      expect(over.config.mutedUserIds).toEqual(["aaa", "bbb"]);
      expect(over.config.rateLimitByLevel).toEqual({ 1: 2, 2: 20 });
    }
  });
});
