/**
 * AGENT-16.a (#86): "When a GitHub run is stuck and needs me, it pings me on
 * Discord like other stuck asks." The bridge side of the handoff in
 * src/watch/owner-ask.ts (REQ-discord-086 / REQ-watch-086).
 *
 * On every scheduler tick the bridge takes each stuck WATCH ask the poller
 * recorded in the shared DB and sends it to the configured owner as a direct
 * message: the same stuck-ask post other surfaces make
 * ({@link formatAskReply}: "⚠️ I'm stuck and need a human." and the quoted,
 * SAFE-6 scrubbed question), led by the GitHub thread it came from, where the
 * owner answers. A DM notifies the owner by itself, so the post carries no
 * mention; it goes to nobody else and to no channel (the question may come
 * from a private repo). The ask is taken first (compare-and-delete) and
 * handed back when the DM does not go out; the next try waits
 * {@link WATCH_ASK_RETRY_MS}. An ask older than a day is given up with a log
 * line, never posted late. A stop waits a short grace for a DM in flight,
 * then hands its ask back so the next start sends it.
 *
 * AUTONOMY-8 / SAFE-14.a (#98): a WATCH run stopped at a spend cap is handed
 * over the same way. Its DM is the spend-stop DM other surfaces send
 * (`formatSpendStopDm`: "💸 Work is paused for budget. Only you see these
 * details." and the quoted, scrubbed question with the amounts and caps), led
 * by the GitHub thread, and it goes out once per cap episode like the
 * channel ping of a chat or schedule stop (`claimCapPing` on the spend alert
 * outbox, keyed on the caps the stop names): a stop whose episode was already
 * told is taken and dropped with a log line. A DM that does not go out, or
 * a stop's hand-back of a DM still in flight, hands both the episode claim
 * and the ask back (a DM that then goes out after all takes both again).
 */

import type { Database } from "bun:sqlite";
import { spendScopesOf } from "../agent/spend-notice.ts";
import { createSpendAlertOutbox, type SpendAlertOutbox } from "../agent/spend-outbox.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { formatErrorLine } from "../store/scrub.ts";
import {
  WATCH_OWNER_ASK_TTL_MS,
  WatchOwnerAskStore,
  type WatchOwnerAsk,
} from "../watch/owner-ask.ts";
import { formatAskReply } from "./ask-ping.ts";
import type { SendPrivateDm } from "./private-reply.ts";
import { formatSpendStopDm } from "./spend-dm.ts";

/** Wait before retrying an ask whose DM did not go out. */
export const WATCH_ASK_RETRY_MS = 10 * 60 * 1000;

/** The owner's DM for a stuck WATCH ask. */
export function formatWatchStuckAskDm(a: WatchOwnerAsk): string {
  return formatAskReply({
    ask: a.ask,
    // The DM itself notifies the owner: no mention.
    owner: null,
    prefix: `GitHub ${a.repo}#${a.number} — answer on the thread: ${a.htmlUrl}`,
  }).content;
}

/**
 * The owner's DM for a WATCH run stopped at a spend cap (SAFE-14.a: only the
 * owner sees the amounts): the spend-stop DM with the GitHub thread second.
 */
export function formatWatchSpendStopDm(a: WatchOwnerAsk): string {
  const [head, ...rest] = formatSpendStopDm({ ask: a.ask }).split("\n");
  return [head, `GitHub ${a.repo}#${a.number}: ${a.htmlUrl}`, ...rest].join("\n");
}

/** The owner's DM for a pending WATCH ask: stuck, or a spend-cap stop. */
export function formatWatchOwnerAskDm(a: WatchOwnerAsk): string {
  return a.ask.reason === "spend-cap" ? formatWatchSpendStopDm(a) : formatWatchStuckAskDm(a);
}

export type WatchAskDeliveryResult = { sent: number; failed: number; expired: number };

export type WatchAskDelivery = {
  /** One pass over the pending asks (single-flight; never rejects). */
  deliver(): Promise<WatchAskDeliveryResult>;
  /** Shutdown: take no further ask. */
  stop(): void;
  /**
   * Wait up to `timeoutMs` for a pass in flight; a DM still in flight then
   * has its ask handed back. True when nothing was left in flight.
   */
  settle(timeoutMs: number): Promise<boolean>;
};

export function createWatchAskDelivery(opts: {
  db: Database;
  owner: () => OwnerRecord | null | undefined;
  /** The gateway's DM sender; undefined until a live gateway is up. */
  sendDm: () => SendPrivateDm | undefined;
  now?: () => number;
  log?: (msg: string) => void;
  /** SAFE-8: the once-per-cap-episode owner ping for spend-cap stops. Default: over `db`. */
  spendAlerts?: SpendAlertOutbox;
}): WatchAskDelivery {
  const store = new WatchOwnerAskStore(opts.db);
  const spendAlerts = opts.spendAlerts ?? createSpendAlertOutbox({ db: opts.db, ...(opts.now ? { now: opts.now } : {}) });
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.log(m));
  const retryAt = new Map<string, number>();
  let stopped = false;
  let pass: Promise<WatchAskDeliveryResult> | null = null;
  /**
   * The ask whose DM is in flight, with its spend-cap episode claim (if any):
   * a shutdown's hand-back gives both back, so a restart DMs it instead of
   * finding its episode already told.
   */
  let current: { ask: WatchOwnerAsk; handedBack: boolean; episode: { release(): void } | null } | null = null;

  const where = (a: WatchOwnerAsk) => `${a.repo}#${a.number} id=${a.eventId}`;
  const label = (a: WatchOwnerAsk) => (a.ask.reason === "spend-cap" ? "WATCH spend-cap stop" : "WATCH stuck ask");
  const why = (a: WatchOwnerAsk) => (a.ask.reason === "spend-cap" ? "AUTONOMY-8" : "AGENT-16.a");

  async function run(): Promise<WatchAskDeliveryResult> {
    const out: WatchAskDeliveryResult = { sent: 0, failed: 0, expired: 0 };
    const send = opts.sendDm();
    const ownerId = opts.owner()?.discordId?.trim();
    for (const a of store.pending()) {
      if (stopped) break;
      const t = now();
      if (t - a.createdAt > WATCH_OWNER_ASK_TTL_MS) {
        if (store.claim(a)) {
          out.expired += 1;
          retryAt.delete(a.id);
          log(`[discord] ${label(a)} ${where(a)}: gave up after a day without reaching the owner on Discord (${why(a)})`);
        }
        continue;
      }
      if (!send || !ownerId) continue;
      if ((retryAt.get(a.id) ?? 0) > t) continue;
      if (!store.claim(a)) continue;
      // SAFE-8: a spend-cap stop DMs the owner once per cap episode.
      let episode: { release(): void } | null = null;
      if (a.ask.reason === "spend-cap") {
        episode = spendAlerts.claimCapPing(spendScopesOf(a.ask));
        if (!episode) {
          retryAt.delete(a.id);
          log(`[discord] ${label(a)} ${where(a)}: the owner was already told about this cap episode; not DMed again (AUTONOMY-8)`);
          continue;
        }
      }
      const entry = { ask: a, handedBack: false, episode };
      current = entry;
      let sent = false;
      try {
        sent = (await send({ userId: ownerId, content: formatWatchOwnerAskDm(a) })) !== null;
      } catch (err) {
        log(`[discord] ${label(a)} ${where(a)}: owner DM failed: ${formatErrorLine(err)}`);
      } finally {
        current = null;
      }
      if (sent) {
        // Handed back by a shutdown while the DM was in flight: take it (and
        // its cap episode, which the hand-back gave back) again.
        if (entry.handedBack) {
          store.claim(a);
          if (a.ask.reason === "spend-cap") spendAlerts.claimCapPing(spendScopesOf(a.ask));
        }
        retryAt.delete(a.id);
        out.sent += 1;
        log(`[discord] ${label(a)} ${where(a)}: owner DMed (${why(a)})`);
      } else {
        episode?.release();
        if (!entry.handedBack) store.release(a);
        retryAt.set(a.id, now() + WATCH_ASK_RETRY_MS);
        out.failed += 1;
        log(`[discord] ${label(a)} ${where(a)}: the owner DM did not go out; retried in ${WATCH_ASK_RETRY_MS / 60_000} min`);
      }
    }
    return out;
  }

  return {
    deliver() {
      if (stopped) return Promise.resolve({ sent: 0, failed: 0, expired: 0 });
      if (pass) return pass;
      pass = run()
        .catch((err) => {
          log(`[discord] WATCH ask delivery (stuck asks, spend-cap stops) failed: ${formatErrorLine(err)}`);
          return { sent: 0, failed: 0, expired: 0 };
        })
        .finally(() => {
          pass = null;
        });
      return pass;
    },
    stop() {
      stopped = true;
    },
    async settle(timeoutMs) {
      const inFlight = pass;
      if (!inFlight) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, timeoutMs));
      });
      try {
        await Promise.race([inFlight, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      const held = current as { ask: WatchOwnerAsk; handedBack: boolean; episode: { release(): void } | null } | null;
      if (held && !held.handedBack) {
        held.handedBack = true;
        // A spend-cap stop's episode claim goes back with it (AUTONOMY-8):
        // otherwise the next start would drop it as already told.
        held.episode?.release();
        try {
          store.release(held.ask);
        } catch (err) {
          log(`[discord] ${label(held.ask)} ${where(held.ask)}: hand-back failed: ${formatErrorLine(err)}`);
        }
      }
      return pass === null;
    },
  };
}
