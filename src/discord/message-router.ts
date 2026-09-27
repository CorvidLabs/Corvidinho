/**
 * Mention / reply / thread → session stub (DISCORD-1 / 2 / 2.a / 5 / 6 / SESSION-MULTI).
 * Entry after gateway; no ProcessManager.
 * DISCORD-DENY-1..3: outside allowlist → refuse without public reply.
 * REQ-discord-201: every start/continue also gates the actor (gateActor).
 * REQ-discord-212: the message's own channel (thread parent or the thread
 * itself) must be allowlisted before any path — a reply/forward that
 * references a tracked bot message never pulls the session into another
 * channel.
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import {
  claimRefusalNotice,
  gateActor,
  gateInbound,
  gateRateOrMute,
  isMonitoredChannel,
  resolvePermissionLevel,
  type RateLimitConfig,
  type RateLimitState,
} from "./permissions.ts";
import type { SessionStore } from "./session-store.ts";
import {
  type InboundMessage,
  type RouteAction,
  type SessionStub,
} from "./types.ts";

/**
 * Strip Discord <@id> tokens from the chat body and append a lookup-friendly
 * `[mentioned: Discord user id …]` trailer (IDENTITY-5). The body stays usable
 * for thin-ack detection (AUTONOMY-5: "<@bot> ok" → "ok"); the trailer keeps
 * snowflakes available for discord-user-lookup.
 */
export function stripMentions(content: string): string {
  const ids: string[] = [];
  const without = content.replace(/<@!?(\d+)>/g, (_m, id: string) => {
    ids.push(id);
    return " ";
  });
  const body = without.replace(/\s+/g, " ").trim();
  if (ids.length === 0) return body;
  const note = [...new Set(ids)]
    .map((id) => `Discord user id ${id}`)
    .join(", ");
  return body ? `${body}\n[mentioned: ${note}]` : `[mentioned: ${note}]`;
}

/** Drop the IDENTITY-5 mention trailer so thin-ack / cancel see the body only. */
export function promptBodyForAskGate(prompt: string): string {
  return prompt
    .replace(/\n?\[mentioned:[^\]]*\]\s*$/i, "")
    .replace(/\bDiscord user id \d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  /**
   * DISCORD-6 — sliding-window rate limit state + config. `permLevel` is an
   * optional fixed override; when absent, `rateLimitByLevel` keys on the
   * actor's resolved permission level (user, roles, owner).
   */
  rateLimit?: { state: RateLimitState; config: RateLimitConfig; permLevel?: number };
  /** Injectable clock for tests. */
  nowMs?: number;
};

function refuseRateOrMute(
  msg: InboundMessage,
  deps: RouterDeps,
): RouteAction | null {
  const rateLimit = deps.rateLimit
    ? {
        ...deps.rateLimit,
        // REQ-discord-010 — rateLimitByLevel applies to the actor's level.
        permLevel:
          deps.rateLimit.permLevel ??
          resolvePermissionLevel({
            userId: msg.authorId,
            roleIds: msg.authorRoleIds,
            allowlist: deps.allowlist,
            owner: deps.owner,
          }),
      }
    : undefined;
  const gate = gateRateOrMute({
    userId: msg.authorId,
    mutedUsers: deps.mutedUsers,
    rateLimit,
    nowMs: deps.nowMs,
  });
  if (gate.ok) return null;
  // DISCORD-6 — no ephemeral on MessageCreate: at most one public notice per
  // user per rate-limit window; later refusals in the window are silent.
  if (
    deps.rateLimit &&
    !claimRefusalNotice(
      deps.rateLimit.state,
      msg.authorId,
      deps.rateLimit.config.windowMs,
      deps.nowMs,
    )
  ) {
    return { kind: "refuse", reason: gate.reason };
  }
  return { kind: "refuse", reason: gate.reason, reply: gate.reply };
}

/** DISCORD-DENY-1: MessageCreate has no ephemeral — never public-reply on deny. */
function silentChannelDeny(): RouteAction {
  return { kind: "refuse", reason: "channel_not_allowlisted" };
}

/**
 * DISCORD-5 / REQ-discord-212 — the channel the message was sent in: the
 * thread's parent (DISCORD-2.a resolution) or the thread itself. The session's
 * recorded channel never stands in for it.
 */
function ownChannelAllowlisted(msg: InboundMessage, deps: RouterDeps): boolean {
  if (isMonitoredChannel(msg.channelId, deps.allowlist)) return true;
  return msg.threadId !== undefined && isMonitoredChannel(msg.threadId, deps.allowlist);
}

/**
 * DISCORD-5 / REQ-discord-212 — may an ask button press in `channelId` resume
 * `session`? The press channel must be allowlisted, or be the session's thread
 * under an allowlisted parent (DISCORD-2.a); and the session's own channel
 * (parent or thread), where the resumed run posts, must still be allowlisted.
 * With no session only the press channel is checked.
 */
export function componentChannelAllowlisted(
  channelId: string,
  session: Pick<SessionStub, "channelId" | "threadId"> | undefined,
  allowlist: AllowlistConfig,
): boolean {
  if (session) {
    const sessionOk =
      isMonitoredChannel(session.channelId, allowlist) ||
      (session.threadId !== undefined && isMonitoredChannel(session.threadId, allowlist));
    if (!sessionOk) return false;
  }
  if (isMonitoredChannel(channelId, allowlist)) return true;
  return (
    session?.threadId !== undefined &&
    session.threadId === channelId &&
    isMonitoredChannel(session.channelId, allowlist)
  );
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

  // DISCORD-5 / DISCORD-DENY-1 / REQ-discord-212 — nothing is processed
  // outside an allowlisted channel, even a reply/forward that references a
  // tracked bot message from an allowlisted one. Silent: MessageCreate has no
  // ephemeral, so never a public reply.
  if (!ownChannelAllowlisted(msg, deps)) {
    return msg.mentionedBot
      ? silentChannelDeny()
      : { kind: "ignore", reason: "channel_not_allowlisted" };
  }

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
        // Parent/thread channel allowlist already checked above.
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
        // Own channel already checked above; the session's channel never
        // stands in for it (REQ-discord-212).
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
