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
 *  - Slash runs answer in one message (the thinking message collapsed into
 *    the answer, DISCORD-ASK-7, else the deferred reply); an edit does not
 *    notify a mention, so the owner notice goes out as a fresh channel post
 *    with allowed mentions limited to the owner.
 *  - A post that did not go out hands its claims back (the warning and the
 *    episode's cap ping), so the next post carries them instead.
 */

import type { SpendAlertOutbox, TakenSpendWarning } from "../agent/spend-outbox.ts";
import type { HumanAsk, SpendWarning } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { appendPostLine, formatSpendWarningReply } from "./ask-ping.ts";
import { finishSlashWithThinking, type SlashFinishThinkingOpts } from "./slash-finish.ts";

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
 * Finish a slash run (`/work`, `/session start`) with its owner notice.
 *
 * The body goes out as one message when practical (DISCORD-ASK-7:
 * finishSlashWithThinking collapses the thinking message into it and drops
 * the deferred reply; else the fallback status + reply). The owner notice
 * (stuck / spend-cap ping, pending 80% warning) is then a FRESH channel post
 * with allowed mentions limited to the owner — an edit does not notify a
 * mention. When that post cannot be sent, the notice is appended to the
 * answer that went out (the collapsed message is edited again, or the reply
 * re-edited); without a post function it rides the body from the start.
 * A body that fails (e.g. an interaction token that expired during a long
 * run) does not stop the notice post. When nothing carried the notice its
 * claims are handed back for the next post, and the body's error is
 * re-thrown afterwards so the gateway still logs it.
 */
export async function finishSlashWithOwnerNotice(
  opts: SlashFinishThinkingOpts & {
    notice: OwnerNotice | null;
    post?: ChannelPost;
  },
): Promise<void> {
  const { notice, post, ...finish } = opts;
  if (!notice) {
    await finishSlashWithThinking(finish);
    return;
  }
  const withNotice = appendPostLine(opts.body, notice.content);
  const mentions = [...new Set([...(opts.mentionUserIds ?? []), ...notice.mentionUserIds])];
  let delivered = false;
  const body: { mode: "collapsed" | "fallback" | null } = { mode: null };
  const failure: { failed: boolean; err?: unknown } = { failed: false };
  const note = (err: unknown) => {
    if (!failure.failed) Object.assign(failure, { failed: true, err });
  };
  try {
    if (!post) {
      await finishSlashWithThinking({
        ...finish,
        body: withNotice,
        mentionUserIds: mentions,
        onDelivered: () => {
          delivered = true;
        },
      });
    } else {
      try {
        await finishSlashWithThinking({
          ...finish,
          onDelivered: (mode) => {
            body.mode = mode;
          },
        });
      } catch (err) {
        note(err);
      }
      try {
        delivered =
          (await post({
            channelId: opts.interaction.channelId,
            content: notice.content,
            mentionUserIds: notice.mentionUserIds,
          })) !== null;
      } catch {
        delivered = false;
      }
      if (!delivered && body.mode === "collapsed" && opts.thinking) {
        // Append to the collapsed answer (edits it again).
        try {
          delivered =
            (await opts.thinking.finalizeContent({
              content: withNotice,
              mentionUserIds: mentions,
            })) !== null;
        } catch {
          delivered = false;
        }
      } else if (!delivered && body.mode === "fallback") {
        const { interaction } = opts;
        try {
          await (interaction.editReply
            ? interaction.editReply({ content: withNotice })
            : interaction.reply({ content: withNotice }));
          delivered = true;
        } catch (err) {
          note(err);
        }
      }
    }
  } catch (err) {
    note(err);
  } finally {
    if (!delivered) notice.release();
  }
  if (failure.failed) throw failure.err;
}
