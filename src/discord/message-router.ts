/**
 * Mention / reply / thread → session stub (DISCORD-1 / 2 / 2.a / 5 / 6).
 * Entry after gateway; no ProcessManager.
 * DISCORD-DENY-1..3: outside allowlist → refuse without public reply.
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import {
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
   * When true (default for chat), only channel allowlist is required to
   * start/continue; user/role lists still apply if you pass checkUsers.
   */
  channelOnlyGate?: boolean;
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

  // Thread path (DISCORD-2.a): continue existing thread session if mapped.
  if (msg.threadId) {
    const existing = deps.store.getByThread(msg.threadId);
    if (existing) {
      // Still require parent/thread channel allowlist.
      if (!isMonitoredChannel(msg.channelId, deps.allowlist) &&
          !isMonitoredChannel(msg.threadId, deps.allowlist)) {
        // Thread id may equal channel id for thread channels; if parent
        // channel was allowlisted at create time, session exists — still
        // re-check the session's channelId.
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
    // No thread session yet — fall through; mention may start one.
  }

  // Reply to bot message (DISCORD-2).
  if (msg.referencedMessageId) {
    const existing = deps.store.getByBotMessage(msg.referencedMessageId);
    if (existing) {
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

  // DISCORD-6 — mute / rate limit before starting a session.
  const blocked = refuseRateOrMute(msg, deps);
  if (blocked) return blocked;

  // DISCORD-1 — @mention starts session stub.
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
