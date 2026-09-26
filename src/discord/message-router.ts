/**
 * Mention / reply / thread → session stub (DISCORD-1 / 2 / 2.a / 5 / 6 / SESSION-MULTI).
 * Entry after gateway; no ProcessManager.
 * DISCORD-DENY-1..3: outside allowlist → refuse without public reply.
 * REQ-discord-201: every start/continue also gates the actor (gateActor).
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import {
  gateActor,
  gateInbound,
  gateRateOrMute,
  isMonitoredChannel,
  type RateLimitConfig,
  type RateLimitState,
} from "./permissions.ts";
import type { SessionStore } from "./session-store.ts";
import {
  type InboundMessage,
  type RouteAction,
} from "./types.ts";

function stripMentions(content: string): string {
  return content.replace(/<@!?\d+>/g, "").trim();
}

export type RouterDeps = {
  store: SessionStore;
  allowlist: AllowlistConfig;
  /**
   * When true (default for chat), the channel gate is the channel allowlist
   * alone; false ⇒ strict checkDiscordAction (empty user+role lists deny).
   * Either way every start/continue also passes gateActor: deny lists win and
   * a non-empty user/role allowlist must match (REQ-discord-201).
   */
  channelOnlyGate?: boolean;
  /** IDENTITY-1 — configured owner; passes gateActor even when unlisted. */
  owner?: OwnerRecord | null;
  /** DISCORD-6 — in-memory muted users. */
  mutedUsers?: Set<string>;
  /** DISCORD-6 — sliding-window rate limit state + config. */
  rateLimit?: { state: RateLimitState; config: RateLimitConfig; permLevel?: number };
  /** Injectable clock for tests. */
  nowMs?: number;
};

function refuseRateOrMute(
  msg: InboundMessage,
  deps: RouterDeps,
): RouteAction | null {
  const gate = gateRateOrMute({
    userId: msg.authorId,
    mutedUsers: deps.mutedUsers,
    rateLimit: deps.rateLimit,
    nowMs: deps.nowMs,
  });
  if (gate.ok) return null;
  return { kind: "refuse", reason: gate.reason, reply: gate.reply };
}

/** DISCORD-DENY-1: MessageCreate has no ephemeral — never public-reply on deny. */
function silentChannelDeny(): RouteAction {
  return { kind: "refuse", reason: "channel_not_allowlisted" };
}

/**
 * REQ-discord-201 / DISCORD-DENY-1 — deny-listed or unlisted actor: silent
 * refuse (no public reply). Null when the actor may proceed.
 */
function refuseActor(msg: InboundMessage, deps: RouterDeps): RouteAction | null {
  const gate = gateActor({
    userId: msg.authorId,
    roleIds: msg.authorRoleIds,
    allowlist: deps.allowlist,
    owner: deps.owner,
  });
  if (gate.ok) return null;
  return { kind: "refuse", reason: "user_not_allowlisted" };
}

/**
 * Pure router: given an inbound message, decide start/continue/refuse/ignore.
 */
export function routeMessage(
  msg: InboundMessage,
  deps: RouterDeps,
): RouteAction {
  if (msg.authorBot) {
    return { kind: "ignore", reason: "bot_author" };
  }

  const channelOnly = deps.channelOnlyGate !== false;

  // Thread path (DISCORD-2.a + SESSION-MULTI-1): continue only the same user's
  // thread session. Other users fall through so they get their own session.
  if (msg.threadId) {
    const existing = deps.store.getByThread(msg.threadId);
    if (existing) {
      // Deny-listed / unlisted actors are refused even when they do not own
      // the thread session (DISCORD-DENY-1 / REQ-discord-201).
      const actorDenied = refuseActor(msg, deps);
      if (actorDenied) return actorDenied;
      if (existing.userId === msg.authorId) {
        // Still require parent/thread channel allowlist.
        if (!isMonitoredChannel(msg.channelId, deps.allowlist) &&
            !isMonitoredChannel(msg.threadId, deps.allowlist)) {
          if (!isMonitoredChannel(existing.channelId, deps.allowlist)) {
            return silentChannelDeny();
          }
        }
        const blocked = refuseRateOrMute(msg, deps);
        if (blocked) return blocked;
        deps.store.touch(existing);
        return {
          kind: "continue_session",
          session: existing,
          prompt: stripMentions(msg.content) || msg.content,
        };
      }
    }
    // No own thread session yet — fall through; mention may start one.
  }

  // Reply to bot message (DISCORD-2 + SESSION-MULTI-1): only the session
  // owner continues; another user cannot hijack via reply.
  if (msg.referencedMessageId) {
    const existing = deps.store.getByBotMessage(msg.referencedMessageId);
    if (existing) {
      const actorDenied = refuseActor(msg, deps);
      if (actorDenied) return actorDenied;
      if (existing.userId === msg.authorId) {
        if (!isMonitoredChannel(existing.channelId, deps.allowlist) &&
            !isMonitoredChannel(msg.channelId, deps.allowlist)) {
          return silentChannelDeny();
        }
        const blocked = refuseRateOrMute(msg, deps);
        if (blocked) return blocked;
        deps.store.touch(existing);
        return {
          kind: "continue_session",
          session: existing,
          prompt: stripMentions(msg.content) || msg.content,
        };
      }
    }
  }

  // Channel gate (DISCORD-5 / DENY-1) before mention handling.
  const gate = gateInbound(
    {
      channelId: msg.channelId,
      userId: channelOnly ? undefined : msg.authorId,
      roleIds: channelOnly ? undefined : msg.authorRoleIds,
      channelOnly,
    },
    deps.allowlist,
  );
  if (!gate.ok) {
    // Quiet for noise and for @mention — never public "not authorized".
    if (msg.mentionedBot) {
      return silentChannelDeny();
    }
    return { kind: "ignore", reason: "channel_not_allowlisted" };
  }

  if (!msg.mentionedBot) {
    return { kind: "ignore", reason: "no_mention" };
  }

  // REQ-discord-201 — user/role allowlist + deny lists (silent refuse).
  const actorDenied = refuseActor(msg, deps);
  if (actorDenied) return actorDenied;

  // DISCORD-6 — mute / rate limit before starting a session.
  const blocked = refuseRateOrMute(msg, deps);
  if (blocked) return blocked;

  // DISCORD-1 / SESSION-MULTI-1 — reuse this user's active session in the
  // channel (or thread) when present; otherwise start a new stub.
  const existing = deps.store.getByUserChannel(
    msg.authorId,
    msg.channelId,
    msg.threadId,
  );
  if (existing) {
    deps.store.touch(existing);
    return {
      kind: "continue_session",
      session: existing,
      prompt: stripMentions(msg.content) || msg.content,
    };
  }
  const session = deps.store.create({
    channelId: msg.channelId,
    userId: msg.authorId,
    threadId: msg.threadId,
  });
  return {
    kind: "start_session",
    session,
    prompt: stripMentions(msg.content) || msg.content,
  };
}
