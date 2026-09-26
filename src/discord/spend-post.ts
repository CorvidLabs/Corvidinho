/**
 * SAFE-8 (#98) with AUTONOMY-1/2 on Discord — who is pinged for a run's ask
 * and where the pending 80% spend warning goes. Shared by the chat reply,
 * `/work`, `/session start` and schedule posts so every bridge surface
 * treats the spend cap the same way.
 *
 *  - A `spend-cap` ask pings the owner once per cap episode (the outbox's
 *    `claimCapPing`); later spend-cap asks still post, without a ping.
 *  - Every post takes the pending 80% warning from the outbox (recorded by
 *    whichever run crossed, on any surface) and pings the owner with it.
 *  - Slash runs answer by editing their deferred reply; an edit may not
 *    notify a mention, so the owner notice goes out as a fresh channel post
 *    with allowed mentions limited to the owner.
 *  - A post that did not go out hands its claims back (the warning and the
 *    episode's cap ping), so the next post carries them instead.
 */

import type { SpendAlertOutbox, TakenSpendWarning } from "../agent/spend-outbox.ts";
import type { HumanAsk, SpendWarning } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { appendPostLine, formatSpendWarningReply } from "./ask-ping.ts";
import type { SlashInteraction } from "./slash-types.ts";

export type AskPingOwner = {
  /** Owner to mention on the ask post, or null for no ping. */
  owner: OwnerRecord | null;
  /** True when the ping was skipped because this cap episode already pinged. */
  deduped: boolean;
  /**
   * Hand the episode's cap ping back when the post carrying it did not go
   * out (a no-op unless this call claimed one).
   */
  release(): void;
};

const NOOP = () => {};

/**
 * Owner to ping for a run's ask. Non-spend-cap asks always ping (when an
 * owner is set); a spend-cap ask pings once per cap episode when an outbox
 * is wired (no outbox ⇒ every time). Call `release` if the post fails.
 */
export function askPingOwner(
  ask: HumanAsk,
  owner: OwnerRecord | null | undefined,
  outbox?: SpendAlertOutbox,
): AskPingOwner {
  const o = owner?.discordId ? owner : null;
  if (!o || ask.reason !== "spend-cap" || !outbox) {
    return { owner: o, deduped: false, release: NOOP };
  }
  const claim = outbox.claimCapPing();
  return claim
    ? { owner: o, deduped: false, release: claim.release }
    : { owner: null, deduped: true, release: NOOP };
}

/** The pending 80% warning for a post: the outbox's, else the run's own. */
export function takeSpendWarning(
  outbox: SpendAlertOutbox | undefined,
  fallback?: SpendWarning,
): TakenSpendWarning | null {
  if (outbox) return outbox.takeWarning(fallback);
  return fallback ? { warning: fallback, release: NOOP } : null;
}

/** A plain channel post (the bridge's gateway reply). */
export type ChannelPost = (p: {
  channelId: string;
  content: string;
  mentionUserIds?: string[];
}) => Promise<{ messageId: string } | null>;

/**
 * True when an ask pings the owner: stuck (AUTONOMY-2) and spend-cap
 * (SAFE-8). A clarify ask addresses the requester instead (AUTONOMY-4).
 */
export function askNeedsOwner(ask: HumanAsk): boolean {
  return ask.reason === "stuck" || ask.reason === "spend-cap";
}

/** One owner line pointing at a slash run's reply that needs them. */
export function ownerAskNoticeLine(ask: HumanAsk, ownerId: string, label: string): string {
  const who = `<@${ownerId}>`;
  if (ask.reason === "spend-cap") {
    return `💸 ${who} ${label} paused at the daily spend cap — see the reply above.`;
  }
  return `⚠️ ${who} ${label} is stuck and needs a human — see the reply above.`;
}

export type OwnerNotice = {
  content: string;
  mentionUserIds: string[];
  /** Hand back what the notice claimed (warning, cap ping) when it did not go out. */
  release(): void;
};

/**
 * Owner notice for a finished slash run (`/work`, `/session start`): the
 * owner ping line for a stuck or spend-cap ask (a clarify ask addresses the
 * requester in the reply, AUTONOMY-4) plus the pending SAFE-8 warning (taken
 * from the outbox here, so call it once per run). Null when there is
 * nothing to tell the owner (any cap-ping claim is then handed back).
 */
export function slashOwnerNotice(opts: {
  owner: OwnerRecord | null | undefined;
  outbox?: SpendAlertOutbox;
  ask?: HumanAsk;
  /** From askPingOwner: whether this ask pings the owner, and its claim. */
  askOwner?: AskPingOwner | null;
  /** The run's own warning (fallback when no outbox). */
  spendWarning?: SpendWarning;
  /** How the run is named in the notice, e.g. "/work `work_…`". */
  label: string;
}): OwnerNotice | null {
  const ownerId = opts.owner?.discordId;
  const lines: string[] = [];
  const releases: Array<() => void> = [];
  if (opts.askOwner) releases.push(opts.askOwner.release);
  if (opts.ask && opts.askOwner?.owner && ownerId && askNeedsOwner(opts.ask)) {
    lines.push(ownerAskNoticeLine(opts.ask, ownerId, opts.label));
  }
  const taken = takeSpendWarning(opts.outbox, opts.spendWarning);
  if (taken) {
    lines.push(formatSpendWarningReply(taken.warning, opts.owner).line);
    releases.push(taken.release);
  }
  const release = () => {
    for (const r of releases) r();
  };
  if (lines.length === 0) {
    release();
    return null;
  }
  return { content: lines.join("\n"), mentionUserIds: ownerId ? [ownerId] : [], release };
}

/**
 * Send a slash run's final reply, then its owner notice as a fresh channel
 * post. Without a post function, or when that post fails, the notice is
 * appended to the reply instead so it is never dropped. A failed reply (e.g.
 * an interaction token that expired during a long run) does not stop the
 * notice: it still goes out as a channel post, and when nothing carried it
 * the notice's claims are handed back for the next post. The reply's error
 * is re-thrown afterwards so the gateway still logs it.
 */
export async function replyWithOwnerNotice(opts: {
  interaction: Pick<SlashInteraction, "channelId" | "reply" | "editReply">;
  body: string;
  notice: OwnerNotice | null;
  post?: ChannelPost;
}): Promise<void> {
  const { interaction, notice, post } = opts;
  const send = (content: string) =>
    interaction.editReply ? interaction.editReply({ content }) : interaction.reply({ content });
  if (!notice) {
    await send(opts.body);
    return;
  }
  let delivered = false;
  const reply: { failed: boolean; err?: unknown } = { failed: false };
  const trySend = async (content: string): Promise<boolean> => {
    try {
      await send(content);
      return true;
    } catch (err) {
      if (!reply.failed) Object.assign(reply, { failed: true, err });
      return false;
    }
  };
  if (post) {
    const replied = await trySend(opts.body);
    try {
      delivered =
        (await post({
          channelId: interaction.channelId,
          content: notice.content,
          mentionUserIds: notice.mentionUserIds,
        })) !== null;
    } catch {
      delivered = false;
    }
    if (!delivered && replied) {
      delivered = await trySend(appendPostLine(opts.body, notice.content));
    }
  } else {
    delivered = await trySend(appendPostLine(opts.body, notice.content));
  }
  if (!delivered) notice.release();
  if (reply.failed) throw reply.err;
}
