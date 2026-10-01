/**
 * Mention / reply / thread → session stub (DISCORD-1 / 2 / 2.a / 5 / 6 / SESSION-MULTI).
 * Entry after gateway; no ProcessManager.
 * DISCORD-DENY-1..3: outside allowlist → refuse without public reply.
 * REQ-discord-201: every start/continue also gates the actor (gateActor).
 * REQ-discord-212: the message's own channel (thread parent or the thread
 * itself) must be allowlisted before any path — a reply/forward that
 * references a tracked bot message never pulls the session into another
 * channel.
 * SESSION-3.a (REQ-discord-472): after a session expired, its user's reply to
 * one of its answers, or their message in its thread, starts a new session
 * from its retained conversation (same gates first) instead of no answer.
 * AGENT-3.a (REQ-discord-302): 'stop' / 'cancel' in reply to a running run's
 * progress message, from its requester or the owner, is `stop_run`; checked
 * right after the channel gate, before the thread and bot-message lookups
 * (the REQ-discord-002 exception).
 * PLUGIN-5.a (REQ-discord-157): such a resume of a `/work` talk's retained
 * conversation is refused with `deps.refuseResume`'s line while `/work` is
 * turned off (no new session is made).
 */

import type { AllowlistConfig } from "../allowlist/types.ts";
import { type ConversationRecord, discordThreadKey } from "../store/conversation.ts";
import { isOwnerDiscord, type OwnerRecord } from "../identity/owner.ts";
import {
  claimRefusalNotice,
  gateActor,
  gateInbound,
  gateRateOrMute,
  isMonitoredChannel,
  isMuted,
  isMonitoredConversation,
  resolvePermissionLevel,
  type RateLimitConfig,
  type RateLimitState,
} from "./permissions.ts";
import { isStopRunText, type SessionRunControl } from "./run-control.ts";
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
  /**
   * AGENT-3.a — the runs in flight, by progress message (REQ-discord-302).
   * Unset ⇒ no `stop_run` route.
   */
  runs?: Pick<SessionRunControl, "byProgressMessage">;
  /**
   * PLUGIN-5.a (REQ-discord-157) — read when a message would resume an
   * expired session's retained conversation (SESSION-3.a): the reply that
   * refuses it (a `/work` talk's while `/work` is turned off), or null to
   * resume as usual. `priorSessionId` is the session that last carried the
   * conversation. Asked before any new session is made. Unset ⇒ resume.
   */
  refuseResume?: (priorSessionId: string) => string | null;
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
 * thread's parent (DISCORD-2.a resolution) or the thread itself, unless
 * either is deny-listed (deny wins, REQ-plugins-005). The session's recorded
 * channel never stands in for it.
 */
function ownChannelAllowlisted(msg: InboundMessage, deps: Pick<RouterDeps, "allowlist">): boolean {
  if (msg.threadId === undefined) return isMonitoredChannel(msg.channelId, deps.allowlist);
  return isMonitoredConversation(msg.threadId, msg.channelId, deps.allowlist);
}

/**
 * DISCORD-5 / REQ-discord-212 — may an ask button press in `channelId` resume
 * `session`? The press channel must be allowlisted, or be the session's thread
 * under an allowlisted parent (DISCORD-2.a); and the session's own channel
 * (parent or thread), where the resumed run posts, must still be allowlisted.
 * A deny on the press channel, the session's channel or its thread always
 * wins (REQ-plugins-005). With no session only the press channel is checked.
 */
export function componentChannelAllowlisted(
  channelId: string,
  session: Pick<SessionStub, "channelId" | "threadId"> | undefined,
  allowlist: AllowlistConfig,
): boolean {
  if (session) {
    const sessionOk =
      session.threadId === undefined
        ? isMonitoredChannel(session.channelId, allowlist)
        : isMonitoredConversation(session.threadId, session.channelId, allowlist);
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
function refuseActor(
  msg: InboundMessage,
  deps: Pick<RouterDeps, "allowlist" | "owner">,
): RouteAction | null {
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
 * AGENT-3.a (REQ-discord-301) — a chat message that waited for its session's
 * run goes on only while it still passes the gates it passed when it came in:
 * its own channel is still allowlisted and not deny-listed (DISCORD-5,
 * REQ-discord-212), its author still passes the actor gate (REQ-discord-201,
 * DISCORD-DENY-1) and is not muted (DISCORD-6). `/admin` list changes and
 * mutes are live, so they can land while it waits. The rate limit is not
 * counted again. False: it runs nothing and posts nothing (DISCORD-DENY-3).
 */
export function waitedMessageStillAllowed(
  msg: InboundMessage,
  deps: Pick<RouterDeps, "allowlist" | "owner" | "mutedUsers">,
): boolean {
  if (!ownChannelAllowlisted(msg, deps)) return false;
  if (refuseActor(msg, deps)) return false;
  return !(deps.mutedUsers && isMuted(deps.mutedUsers, msg.authorId));
}

/**
 * AGENT-3.a (REQ-discord-301) — the same re-check for an ask pick or Answer
 * form submit that waited for its session's run: the press channel and the
 * session's own channel (`componentChannelAllowlisted`), the actor gate and
 * mute, as at press time. False: the resumed run does not start.
 */
export function waitedPressStillAllowed(
  press: { channelId: string; userId: string; roleIds?: string[] },
  session: Pick<SessionStub, "channelId" | "threadId">,
  deps: Pick<RouterDeps, "allowlist" | "owner" | "mutedUsers">,
): boolean {
  if (!componentChannelAllowlisted(press.channelId, session, deps.allowlist)) return false;
  const actor = gateActor({
    userId: press.userId,
    roleIds: press.roleIds,
    allowlist: deps.allowlist,
    owner: deps.owner,
  });
  if (!actor.ok) return false;
  return !(deps.mutedUsers && isMuted(deps.mutedUsers, press.userId));
}

/**
 * SESSION-3.a (REQ-discord-472) — the message author's retained conversation
 * (`record`, from a reply to one of its answers or from their thread) starts
 * a new session that begins from it, after the actor and mute/rate gates (the
 * channel gate already ran). Only the conversation's own user, and only where
 * it was held (the same thread, or the same channel outside threads). A live
 * session already carrying it is continued instead; one that idled out keeps
 * its turns in the record on that lookup, and the new session starts from the
 * record as stored then. Null when `record` does not apply or is gone.
 */
function resumeRetained(
  msg: InboundMessage,
  deps: RouterDeps,
  record: ConversationRecord | undefined,
): RouteAction | null {
  if (!record || record.userId !== msg.authorId) return null;
  if (record.threadKey !== discordThreadKey(msg)) return null;
  const actorDenied = refuseActor(msg, deps);
  if (actorDenied) return actorDenied;
  const blocked = refuseRateOrMute(msg, deps);
  if (blocked) return blocked;
  const prompt = stripMentions(msg.content) || msg.content;
  const live = record.sessionId ? deps.store.get(record.sessionId) : undefined;
  if (live && live.userId === msg.authorId) {
    deps.store.touch(live);
    return { kind: "continue_session", session: live, prompt };
  }
  // PLUGIN-5.a: a `/work` talk's conversation is not resumed while `/work`
  // is turned off — the fixed line, and no new session is made.
  const refusal = record.sessionId ? deps.refuseResume?.(record.sessionId) : null;
  if (refusal) return { kind: "refuse", reason: "extra_disabled", reply: refusal };
  const session = deps.store.resumeFromRetained(record, {
    channelId: msg.channelId,
    userId: msg.authorId,
    threadId: msg.threadId,
  });
  if (!session) return null;
  return { kind: "start_session", session, prompt };
}

/**
 * AGENT-3.a (REQ-discord-302) — a reply whose whole text is 'stop' or
 * 'cancel' to the progress message of a run in flight, in that message's own
 * channel, from the run's requester or the owner: `stop_run`, after the actor
 * and mute/rate gates. Null when it is not one (anyone else's reply, other
 * text, a finished run): the message then routes as before.
 */
function stopRunRoute(msg: InboundMessage, deps: RouterDeps): RouteAction | null {
  if (!msg.referencedMessageId || !deps.runs) return null;
  const run = deps.runs.byProgressMessage(msg.referencedMessageId);
  if (!run || run.channelId !== (msg.threadId ?? msg.channelId)) return null;
  if (!isStopRunText(promptBodyForAskGate(stripMentions(msg.content)))) return null;
  if (run.requesterId !== msg.authorId && !isOwnerDiscord(deps.owner, msg.authorId)) {
    return null;
  }
  const actorDenied = refuseActor(msg, deps);
  if (actorDenied) return actorDenied;
  const blocked = refuseRateOrMute(msg, deps);
  if (blocked) return blocked;
  return { kind: "stop_run", runId: run.runId, sessionId: run.sessionId };
}

/**
 * Pure router: given an inbound message, decide start/continue/refuse/ignore
 * (or `stop_run`, AGENT-3.a).
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

  // AGENT-3.a (REQ-discord-302): 'stop' / 'cancel' in reply to a running
  // run's progress message stops that run — before the thread and
  // bot-message lookups, so the owner's reply stops it too and a reply to a
  // tracked stub that is the progress message never continues the session.
  const stop = stopRunRoute(msg, deps);
  if (stop) return stop;

  // Thread path (DISCORD-2.a + SESSION-MULTI-1/2): each user has their own
  // session in a thread, and a plain message continues only the author's own.
  // Another user starting theirs in the same thread never takes this one over.
  if (msg.threadId) {
    const own = deps.store.getByThread(msg.threadId, msg.authorId);
    if (own ?? deps.store.getByThread(msg.threadId)) {
      // Deny-listed / unlisted actors are refused even when they do not own
      // a thread session (DISCORD-DENY-1 / REQ-discord-201).
      const actorDenied = refuseActor(msg, deps);
      if (actorDenied) return actorDenied;
    }
    if (own) {
      // Parent/thread channel allowlist already checked above.
      const blocked = refuseRateOrMute(msg, deps);
      if (blocked) return blocked;
      deps.store.touch(own);
      return {
        kind: "continue_session",
        session: own,
        prompt: stripMentions(msg.content) || msg.content,
      };
    }
    // SESSION-3.a: my session in this thread expired — my message here
    // starts a new one from its retained conversation.
    const resumed = resumeRetained(
      msg,
      deps,
      deps.store.retainedForThread(msg.threadId, msg.authorId),
    );
    if (resumed) return resumed;
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
    } else {
      // SESSION-3.a: a reply to an answer of my expired session starts a
      // new session from its retained conversation.
      const resumed = resumeRetained(
        msg,
        deps,
        deps.store.retainedForReply(msg.referencedMessageId),
      );
      if (resumed) return resumed;
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
