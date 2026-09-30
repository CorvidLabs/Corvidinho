/**
 * SAFE-14.a (#98) — spend amounts and cap settings reach only the owner, by DM.
 *
 * Channel posts say only that work is paused for budget (ask-ping.ts,
 * spend-post.ts). What the owner needs to act on goes to the configured
 * owner's DMs through the bridge's gateway `sendDm` (the path the forget
 * cards and MEMORY-7.a private replies use):
 *  - the 80% warning, claimed from the spend alert outbox (recorded by any
 *    run on this data dir: chat, slash, schedules, WATCH, the daemon,
 *    delegate workers; the run's own warning only when the bridge has no DB)
 *    and rebuilt from its integer amounts (`formatSpendWarningLine`), never
 *    from child text — one line per cap that crossed 80% (SAFE-15: the total
 *    cap and each provider cap, named by scope);
 *  - a cap stop's details: the run's `spend-cap` ask question (spend, the
 *    call's estimate, the cap and the setting the operator changes), once per
 *    cap episode — whenever the stop's post claims the owner's channel ping
 *    (`askPingOwner`) — secret-scrubbed and defanged.
 *
 * Delivery runs after each bridge run and on every scheduler tick. A DM that
 * does not go out keeps its claim for the next pass: the warning is handed
 * back to the outbox (it stays pending in `spend_alerts`) and a stop's
 * details stay held in memory (a newer stop replaces them). A failure is
 * logged once per failure streak, with no amounts. With no owner configured
 * or no DM path yet nothing is claimed, so the warning stays pending.
 */

import { formatSpendWarningLine, SPEND_PAUSED_TEXT } from "../agent/spend-notice.ts";
import type { SpendAlertOutbox } from "../agent/spend-outbox.ts";
import type { HumanAsk, SpendWarning } from "../agent/types.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { scrubSecrets } from "../store/scrub.ts";
import { defangMassMentions } from "./allowed-mentions.ts";
import { ASK_REPLY_QUESTION_MAX } from "./ask-ping.ts";
import type { SendPrivateDm } from "./private-reply.ts";
import { takeSpendWarning, type AskPingOwner } from "./spend-post.ts";

/** First line of a cap stop's DM. */
export const SPEND_STOP_DM_HEAD = `💸 ${SPEND_PAUSED_TEXT} Only you see these details (SAFE-14.a).`;

/** Logged once per failure streak (no amounts). */
export const SPEND_DM_FAILED_LOG =
  "[discord] spend DM to the owner did not go out (SAFE-14.a) — kept and retried on the next scheduler tick; check that the owner accepts DMs from server members";

/** Logged once while the bridge has no DM path yet (no amounts). */
export const SPEND_DM_NO_PATH_LOG =
  "[discord] spend DM to the owner waits: no DM path yet (SAFE-14.a) — kept and retried on the next scheduler tick";

/** A run stopped at the spend cap: what to DM the owner. */
export type SpendStop = {
  ask: HumanAsk;
  /** Where the run was (its channel), named in the DM. */
  channelId?: string;
};

export type SpendDmDeps = {
  /** The bridge's spend alert outbox (the pending 80% warning). */
  outbox?: SpendAlertOutbox;
  /** The configured owner, read now (IDENTITY-1). */
  owner: () => OwnerRecord | null | undefined;
  /** The gateway's DM send, read now (unset until the gateway is up). */
  sendDm: () => SendPrivateDm | undefined;
  log?: (line: string) => void;
};

export type SpendDmOutcome = "sent" | "failed" | "none";

export type SpendDmPass = { stop: SpendDmOutcome; warning: SpendDmOutcome };

export type SpendDm = {
  /**
   * One delivery pass (a stop given here is held first, replacing an older
   * held one): the held stop's details, then the pending 80% warning (the
   * outbox's, else `warning`, the run's own). Passes run one at a time.
   * Never rejects.
   */
  deliver(opts?: { stop?: SpendStop; warning?: SpendWarning }): Promise<SpendDmPass>;
  /** True while a spend DM that did not go out waits for the next pass. */
  waiting(): boolean;
};

/** The DM text for a cap stop (the owner's eyes only). */
export function formatSpendStopDm(stop: SpendStop): string {
  const q = defangMassMentions(scrubSecrets(stop.ask.question)).trim();
  const question = q.length <= ASK_REPLY_QUESTION_MAX ? q : `${q.slice(0, ASK_REPLY_QUESTION_MAX - 1)}…`;
  const where = stop.channelId?.trim() ? `In <#${stop.channelId.trim()}>:\n` : "";
  return `${SPEND_STOP_DM_HEAD}\n${where}${question
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}`;
}

/**
 * The DM text for the 80% warning (rebuilt from its integer amounts): one
 * line per cap that crossed it (SAFE-15: the total cap and each provider cap).
 */
export function formatSpendWarningDm(warning: SpendWarning | readonly SpendWarning[]): string {
  const list: readonly SpendWarning[] = Array.isArray(warning) ? warning : [warning as SpendWarning];
  return list.map(formatSpendWarningLine).join("\n");
}

/**
 * The stop a run's post hands to the DM: a `spend-cap` ask whose post claimed
 * the owner's ping this cap episode (`askPingOwner`), so the owner gets one
 * DM per episode, like one channel ping.
 */
export function spendStopFor(
  ask: HumanAsk | undefined,
  askOwner: AskPingOwner | null | undefined,
  channelId?: string,
): SpendStop | undefined {
  if (ask?.reason !== "spend-cap" || !askOwner?.owner) return undefined;
  return { ask, ...(channelId ? { channelId } : {}) };
}

export function createSpendDm(deps: SpendDmDeps): SpendDm {
  const log = deps.log ?? ((line: string) => console.warn(line));
  let held: { content: string } | null = null;
  let warningFailed = false;
  let failing = false;
  let noPathLogged = false;
  let chain: Promise<unknown> = Promise.resolve();

  const send = async (userId: string, fn: SendPrivateDm, content: string): Promise<boolean> => {
    try {
      return (await fn({ userId, content })) !== null;
    } catch {
      return false;
    }
  };
  const noteFailure = () => {
    if (!failing) log(SPEND_DM_FAILED_LOG);
    failing = true;
  };

  const pass = async (opts: { stop?: SpendStop; warning?: SpendWarning }): Promise<SpendDmPass> => {
    const out: SpendDmPass = { stop: "none", warning: "none" };
    if (opts.stop) held = { content: formatSpendStopDm(opts.stop) };
    const userId = deps.owner()?.discordId?.trim();
    if (!userId) return out;
    const fn = deps.sendDm();
    if (!fn) {
      if (held && !noPathLogged) log(SPEND_DM_NO_PATH_LOG);
      noPathLogged = true;
      return out;
    }
    const stop = held;
    if (stop) {
      if (await send(userId, fn, stop.content)) {
        if (held === stop) held = null;
        out.stop = "sent";
      } else {
        out.stop = "failed";
      }
    }
    const taken = takeSpendWarning(deps.outbox, opts.warning);
    if (taken) {
      if (await send(userId, fn, formatSpendWarningDm(taken.warnings ?? taken.warning))) {
        out.warning = "sent";
        warningFailed = false;
      } else {
        taken.release();
        out.warning = "failed";
        warningFailed = true;
      }
    } else {
      // Nothing due now (none pending, or spend back under 80%).
      warningFailed = false;
    }
    if (out.stop === "failed" || out.warning === "failed") noteFailure();
    else if (out.stop === "sent" || out.warning === "sent") failing = false;
    return out;
  };

  return {
    deliver(opts = {}) {
      const run = chain.then(() => pass(opts)).catch((err): SpendDmPass => {
        log(`[discord] spend DM pass failed (SAFE-14.a): ${err instanceof Error ? err.message : String(err)}`);
        return { stop: "none", warning: "none" };
      });
      chain = run;
      return run;
    },
    waiting() {
      return held !== null || warningFailed;
    },
  };
}
