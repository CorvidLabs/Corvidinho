/**
 * DISCORD-6 / REQ-discord-010 regressions (bridge e2e audit defects 6, 8, 11):
 * - DISCORD_RATE_LIMIT_BY_LEVEL applies to chat and slash from the actor's
 *   resolved permission level (it used to be ignored: no level was passed).
 * - /mute refuses the invoker and the configured owner (the owner could mute
 *   themselves and then /unmute was refused until restart).
 * - A muted or rate-limited user gets at most one public MessageCreate notice
 *   per rate-limit window (it used to be one public post per spam message);
 *   slash refusals stay ephemeral on every call.
 * Fixture only: fake gateway, echo agent, in-memory DB, no token or network.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { emptyConfig } from "../src/allowlist/types.ts";
import { createEchoAgentClient } from "../src/discord/agent-client.ts";
import { memoryThinkingOutbound, startBridge } from "../src/discord/bridge.ts";
import {
  handleMuteCommand,
  MUTE_SELF_OR_OWNER_REFUSED,
} from "../src/discord/command-handlers/mute.ts";
import { createNullGateway, type GatewayHandlers } from "../src/discord/gateway.ts";
import { routeMessage } from "../src/discord/message-router.ts";
import {
  claimRefusalNotice,
  defaultRateLimitConfig,
  PermissionLevel,
  type RateLimitState,
} from "../src/discord/permissions.ts";
import { SessionStore } from "../src/discord/session-store.ts";
import { handleSlashInteraction } from "../src/discord/slash-dispatch.ts";
import type {
  SlashContext,
  SlashInteraction,
  SlashReplyPayload,
} from "../src/discord/slash-types.ts";
import { MUTED, RATE_LIMITED, type InboundMessage } from "../src/discord/types.ts";
import { WorkStore } from "../src/discord/work-store.ts";

/** Missing allowlist file: never read the operator's allowlist (ALLOW-4). */
const NO_ALLOWLIST = join(mkdtempSync(join(tmpdir(), "corvidinho-rate-mute-")), "no-allowlist.toml");
const OWNER = "100000000000000001";
const MEMBER = "200000000000000002";
const PEER = "300000000000000003";

type Booted = {
  result: Extract<Awaited<ReturnType<typeof startBridge>>, { ok: true }>;
  handlers: GatewayHandlers;
  publicReplies: Array<{ content: string; channelId: string }>;
  sends: () => number;
};

async function boot(extraEnv: Record<string, string> = {}): Promise<Booted> {
  const box: { handlers: GatewayHandlers | null } = { handlers: null };
  const publicReplies: Array<{ content: string; channelId: string }> = [];
  const outbound = memoryThinkingOutbound();
  const result = await startBridge({
    env: {
      DISCORD_BOT_TOKEN: "fake",
      DISCORD_CHANNEL_IDS: "chan-1",
      CORVIDINHO_DISCORD_DRY_RUN: "1",
      CORVIDINHO_ALLOWLIST_FILE: NO_ALLOWLIST,
      CORVIDINHO_OWNER_DISCORD_ID: OWNER,
      ...extraEnv,
    },
    // Temp non-git project: never create real worktrees/branches in this repo.
    projectRoot: mkdtempSync(join(tmpdir(), "corvidinho-rate-mute-proj-")),
    skipProtocolCheck: true,
    disableScheduler: true,
    thinkingOutbound: outbound,
    thinkingDebounceMs: 0,
    thinkingTickMs: 60_000,
    agent: createEchoAgentClient(),
    gatewayFactory: async (_cfg, handlers) => {
      box.handlers = handlers;
      handlers.reply = async ({ content, channelId }) => {
        publicReplies.push({ content, channelId });
        return { messageId: `bot_${publicReplies.length}` };
      };
      return createNullGateway();
    },
  });
  if (!result.ok) throw new Error(`bridge failed to start: ${result.message}`);
  if (!box.handlers) throw new Error("gateway handlers not captured");
  return {
    result,
    handlers: box.handlers,
    publicReplies,
    sends: () => outbound.sends.length,
  };
}

let seq = 0;
function slash(
  commandName: string,
  userId: string,
  options: SlashInteraction["options"] = {},
): { ix: SlashInteraction; replies: SlashReplyPayload[] } {
  const replies: SlashReplyPayload[] = [];
  seq += 1;
  return {
    replies,
    ix: {
      id: `ix_${seq}`,
      commandName,
      channelId: "chan-1",
      userId,
      options,
      reply: async (p) => void replies.push(p),
    },
  };
}

function mention(authorId: string, over: Partial<InboundMessage> = {}): InboundMessage {
  seq += 1;
  return {
    id: `m_${seq}`,
    channelId: "chan-1",
    authorId,
    authorBot: false,
    content: "<@bot> hello",
    mentionedBot: true,
    ...over,
  };
}

function allowCfg() {
  const cfg = emptyConfig();
  cfg.discord.channels = ["chan-1"];
  return cfg;
}

describe("DISCORD_RATE_LIMIT_BY_LEVEL applies to the actor's level (defect 6)", () => {
  test("bridge slash: owner (ADMIN=3) gets the level-3 max; a member keeps the default", async () => {
    const { result, handlers } = await boot({
      DISCORD_RATE_LIMIT_MAX: "3",
      DISCORD_RATE_LIMIT_BY_LEVEL: '{"3":100}',
    });
    const ownerReplies: Array<string | undefined> = [];
    for (let n = 0; n < 6; n++) {
      const { ix, replies } = slash("status", OWNER);
      await handlers.onSlash!(ix);
      ownerReplies.push(replies[0]?.content);
    }
    // Before the fix the owner's 4th /status got "Slow down!".
    expect(ownerReplies.filter((c) => c === RATE_LIMITED)).toHaveLength(0);
    expect(ownerReplies.every((c) => c?.includes("Corvidinho"))).toBe(true);

    const memberReplies: SlashReplyPayload[] = [];
    for (let n = 0; n < 4; n++) {
      const { ix, replies } = slash("status", MEMBER);
      await handlers.onSlash!(ix);
      memberReplies.push(replies[0]!);
    }
    expect(memberReplies.slice(0, 3).every((r) => r.content !== RATE_LIMITED)).toBe(true);
    expect(memberReplies[3]).toMatchObject({ content: RATE_LIMITED, ephemeral: true });
    await result.stop();
  });

  test("bridge chat: owner mentions past the default max still run; a member is limited", async () => {
    const { result, handlers, publicReplies, sends } = await boot({
      DISCORD_RATE_LIMIT_MAX: "3",
      DISCORD_RATE_LIMIT_BY_LEVEL: '{"3":100}',
    });
    for (let n = 0; n < 5; n++) await handlers.onMessage(mention(OWNER));
    expect(publicReplies.filter((r) => r.content === RATE_LIMITED)).toHaveLength(0);
    expect(sends()).toBe(5);

    for (let n = 0; n < 4; n++) await handlers.onMessage(mention(MEMBER));
    expect(sends()).toBe(8);
    expect(publicReplies.filter((r) => r.content === RATE_LIMITED)).toHaveLength(1);
    await result.stop();
  });

  test("router: a member holding an allowed role is limited at the STANDARD level max", () => {
    const allowlist = allowCfg();
    allowlist.discord.users = ["someone-else"];
    allowlist.discord.roles = ["role-a"];
    const store = new SessionStore();
    const rate = {
      state: { userMessageTimestamps: new Map() } as RateLimitState,
      config: defaultRateLimitConfig({
        windowMs: 60_000,
        maxMessages: 10,
        rateLimitByLevel: { [PermissionLevel.STANDARD]: 1 },
      }),
    };
    const deps = { store, allowlist, rateLimit: rate, nowMs: 1_000 };
    const first = routeMessage(mention(MEMBER, { authorRoleIds: ["role-a"] }), deps);
    expect(first.kind).toBe("start_session");
    const second = routeMessage(mention(MEMBER, { authorRoleIds: ["role-a"] }), deps);
    expect(second).toMatchObject({ kind: "refuse", reason: "rate_limited", reply: RATE_LIMITED });
  });

  test("slash dispatch: role-resolved level applies; an explicit permLevelFor still wins", async () => {
    const allowlist = allowCfg();
    allowlist.discord.roles = ["role-a"];
    const state: RateLimitState = { userMessageTimestamps: new Map() };
    const ctx: SlashContext = {
      store: new SessionStore(),
      workStore: new WorkStore(),
      allowlist,
      agent: createEchoAgentClient(),
      version: "0.0.1",
      protocolVersion: 1,
      startedAt: Date.now(),
      channelIds: ["chan-1"],
      rateLimitState: state,
      rateLimitConfig: defaultRateLimitConfig({
        windowMs: 60_000,
        maxMessages: 10,
        rateLimitByLevel: { [PermissionLevel.STANDARD]: 1, [PermissionLevel.ADMIN]: 50 },
      }),
    };
    const a = slash("status", MEMBER);
    a.ix.roleIds = ["role-a"];
    expect((await handleSlashInteraction(ctx, a.ix)).ok).toBe(true);
    const b = slash("status", MEMBER);
    b.ix.roleIds = ["role-a"];
    const rb = await handleSlashInteraction(ctx, b.ix);
    expect(rb).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(b.replies[0]).toMatchObject({ content: RATE_LIMITED, ephemeral: true });

    // Override: permLevelFor pins PEER to ADMIN (50) although roles say STANDARD.
    ctx.permLevelFor = (id) => (id === PEER ? PermissionLevel.ADMIN : undefined);
    for (let n = 0; n < 3; n++) {
      const c = slash("status", PEER);
      c.ix.roleIds = ["role-a"];
      expect((await handleSlashInteraction(ctx, c.ix)).ok).toBe(true);
    }
  });
});

describe("/mute never targets the invoker or the owner (defect 8)", () => {
  test("bridge: owner /mute of themselves is refused ephemeral; /unmute and /status still work", async () => {
    const { result, handlers } = await boot();
    const m = slash("mute", OWNER, { user: OWNER });
    await handlers.onSlash!(m.ix);
    expect(m.replies[0]).toEqual({ content: MUTE_SELF_OR_OWNER_REFUSED, ephemeral: true });
    expect(result.mutedUsers.has(OWNER)).toBe(false);

    const u = slash("unmute", OWNER, { user: OWNER });
    await handlers.onSlash!(u.ix);
    expect(u.replies[0]?.content).not.toBe(MUTED);
    expect(u.replies[0]?.ephemeral).toBe(true);

    const s = slash("status", OWNER);
    await handlers.onSlash!(s.ix);
    expect(s.replies[0]?.content).toContain("Corvidinho");

    // Muting someone else still works, and the owner can undo it.
    const mm = slash("mute", OWNER, { user: MEMBER });
    await handlers.onSlash!(mm.ix);
    expect(result.mutedUsers.has(MEMBER)).toBe(true);
    const ms = slash("status", MEMBER);
    await handlers.onSlash!(ms.ix);
    expect(ms.replies[0]).toMatchObject({ content: MUTED, ephemeral: true });
    const mu = slash("unmute", OWNER, { user: MEMBER });
    await handlers.onSlash!(mu.ix);
    expect(result.mutedUsers.has(MEMBER)).toBe(false);
    await result.stop();
  });

  test("handler: the configured owner cannot be muted by any invoker; self-mute is refused without an owner", async () => {
    const base: SlashContext = {
      store: new SessionStore(),
      workStore: new WorkStore(),
      allowlist: allowCfg(),
      agent: createEchoAgentClient(),
      version: "0.0.1",
      protocolVersion: 1,
      startedAt: Date.now(),
      channelIds: ["chan-1"],
      mutedUsers: new Set<string>(),
      owner: { discordId: OWNER },
    };
    const other = slash("mute", MEMBER, { user: OWNER });
    await handleMuteCommand(base, other.ix);
    expect(other.replies[0]).toEqual({ content: MUTE_SELF_OR_OWNER_REFUSED, ephemeral: true });
    expect(base.mutedUsers!.size).toBe(0);

    const noOwner: SlashContext = { ...base, owner: null, mutedUsers: new Set<string>() };
    const self = slash("mute", PEER, { user: PEER });
    await handleMuteCommand(noOwner, self.ix);
    expect(self.replies[0]).toEqual({ content: MUTE_SELF_OR_OWNER_REFUSED, ephemeral: true });
    expect(noOwner.mutedUsers!.size).toBe(0);
  });
});

describe("muted / rate-limited MessageCreate: one public notice per window (defect 11)", () => {
  test("bridge: a muted spammer gets one public reply, not one per message; nothing runs", async () => {
    const { result, handlers, publicReplies, sends } = await boot({
      DISCORD_MUTED_USER_IDS: MEMBER,
    });
    for (let n = 0; n < 5; n++) await handlers.onMessage(mention(MEMBER));
    expect(publicReplies.map((r) => r.content)).toEqual([MUTED]);
    expect(sends()).toBe(0);
    expect(result.store.bySessionId.size).toBe(0);

    // Another user is not punished.
    await handlers.onMessage(mention(PEER));
    expect(sends()).toBe(1);
    await result.stop();
  });

  test("bridge: a rate-limited spammer gets one 'Slow down!' per window; a peer still runs", async () => {
    const { result, handlers, publicReplies, sends } = await boot({
      DISCORD_RATE_LIMIT_MAX: "1",
    });
    for (let n = 0; n < 5; n++) await handlers.onMessage(mention(MEMBER));
    expect(sends()).toBe(1);
    expect(publicReplies.filter((r) => r.content === RATE_LIMITED)).toHaveLength(1);

    await handlers.onMessage(mention(PEER));
    expect(sends()).toBe(2);
    await result.stop();
  });

  test("router: the notice comes back once the window has passed; reply/thread paths share it", () => {
    const store = new SessionStore();
    const muted = new Set<string>();
    const rate = {
      state: { userMessageTimestamps: new Map() } as RateLimitState,
      config: defaultRateLimitConfig({ windowMs: 60_000, maxMessages: 10 }),
    };
    const deps = (nowMs: number) => ({
      store,
      allowlist: allowCfg(),
      mutedUsers: muted,
      rateLimit: rate,
      nowMs,
    });
    const start = routeMessage(mention(MEMBER), deps(1_000));
    expect(start.kind).toBe("start_session");
    if (start.kind !== "start_session") return;
    store.trackBotMessage("bot-msg-1", start.session);
    muted.add(MEMBER);

    const first = routeMessage(mention(MEMBER), deps(2_000));
    expect(first).toEqual({ kind: "refuse", reason: "muted", reply: MUTED });
    // Reply-to-bot within the window: refused, silent.
    const reply = routeMessage(
      mention(MEMBER, { mentionedBot: false, content: "more", referencedMessageId: "bot-msg-1" }),
      deps(3_000),
    );
    expect(reply).toEqual({ kind: "refuse", reason: "muted" });
    const again = routeMessage(mention(MEMBER), deps(61_999));
    expect(again).toEqual({ kind: "refuse", reason: "muted" });
    // Window elapsed since the last notice: one more notice.
    const later = routeMessage(mention(MEMBER), deps(62_000));
    expect(later).toEqual({ kind: "refuse", reason: "muted", reply: MUTED });
    // Other users keep their own notice budget and are served.
    expect(routeMessage(mention(PEER), deps(62_001)).kind).toBe("start_session");
  });

  test("slash refusals stay ephemeral on every call (DISCORD-DENY / Discord ack)", async () => {
    const { result, handlers, publicReplies } = await boot({
      DISCORD_MUTED_USER_IDS: MEMBER,
    });
    for (let n = 0; n < 3; n++) {
      const { ix, replies } = slash("status", MEMBER);
      await handlers.onSlash!(ix);
      expect(replies).toEqual([{ content: MUTED, ephemeral: true }]);
    }
    expect(publicReplies).toHaveLength(0);
    await result.stop();
  });

  test("claimRefusalNotice: per user, per window, and expired entries are dropped", () => {
    const state: RateLimitState = { userMessageTimestamps: new Map() };
    expect(claimRefusalNotice(state, "a", 1_000, 0)).toBe(true);
    expect(claimRefusalNotice(state, "a", 1_000, 999)).toBe(false);
    expect(claimRefusalNotice(state, "b", 1_000, 999)).toBe(true);
    expect(claimRefusalNotice(state, "a", 1_000, 1_000)).toBe(true);
    // "b" (claimed at 999) is still inside its window; nothing stale yet.
    expect(state.refusalNoticeAt?.size).toBe(2);
    expect(claimRefusalNotice(state, "c", 1_000, 5_000)).toBe(true);
    expect([...state.refusalNoticeAt!.keys()]).toEqual(["c"]);
  });
});
