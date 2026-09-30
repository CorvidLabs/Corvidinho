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
 */

import type { Database } from "bun:sqlite";
import type { OwnerRecord } from "../identity/owner.ts";
import { formatErrorLine } from "../store/scrub.ts";
import {
  WATCH_OWNER_ASK_TTL_MS,
  WatchOwnerAskStore,
  type WatchOwnerAsk,
} from "../watch/owner-ask.ts";
import { formatAskReply } from "./ask-ping.ts";
import type { SendPrivateDm } from "./private-reply.ts";

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
}): WatchAskDelivery {
  const store = new WatchOwnerAskStore(opts.db);
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((m: string) => console.log(m));
  const retryAt = new Map<string, number>();
  let stopped = false;
  let pass: Promise<WatchAskDeliveryResult> | null = null;
  let current: { ask: WatchOwnerAsk; handedBack: boolean } | null = null;

  const where = (a: WatchOwnerAsk) => `${a.repo}#${a.number} id=${a.eventId}`;

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
          log(`[discord] WATCH stuck ask ${where(a)}: gave up after a day without reaching the owner on Discord (AGENT-16.a)`);
        }
        continue;
      }
      if (!send || !ownerId) continue;
      if ((retryAt.get(a.id) ?? 0) > t) continue;
      if (!store.claim(a)) continue;
      const entry = { ask: a, handedBack: false };
      current = entry;
      let sent = false;
      try {
        sent = (await send({ userId: ownerId, content: formatWatchStuckAskDm(a) })) !== null;
      } catch (err) {
        log(`[discord] WATCH stuck ask ${where(a)}: owner DM failed: ${formatErrorLine(err)}`);
      } finally {
        current = null;
      }
      if (sent) {
        // Handed back by a shutdown while the DM was in flight: take it again.
        if (entry.handedBack) store.claim(a);
        retryAt.delete(a.id);
        out.sent += 1;
        log(`[discord] WATCH stuck ask ${where(a)}: owner DMed (AGENT-16.a)`);
      } else {
        if (!entry.handedBack) store.release(a);
        retryAt.set(a.id, now() + WATCH_ASK_RETRY_MS);
        out.failed += 1;
        log(`[discord] WATCH stuck ask ${where(a)}: the owner DM did not go out; retried in ${WATCH_ASK_RETRY_MS / 60_000} min`);
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
          log(`[discord] WATCH stuck ask delivery failed: ${formatErrorLine(err)}`);
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
      const held = current as { ask: WatchOwnerAsk; handedBack: boolean } | null;
      if (held && !held.handedBack) {
        held.handedBack = true;
        try {
          store.release(held.ask);
        } catch (err) {
          log(`[discord] WATCH stuck ask ${where(held.ask)}: hand-back failed: ${formatErrorLine(err)}`);
        }
      }
      return pass === null;
    },
  };
}
