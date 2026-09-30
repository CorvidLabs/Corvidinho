/**
 * SAFE-8 / SAFE-8.a / SAFE-19 (#98) — the owner's spend Approve card: the
 * `spend` kind of the Approve/Deny card engine (src/discord/approval-cards.ts,
 * SAFE-18..20).
 *
 * A run whose next priced model call would pass a spend cap holds that call
 * and records a `spend` request in `approval_requests` (src/agent/spend.ts
 * `createSpendGuard`; any process on the data dir: chat and slash runs,
 * schedules, WATCH, the daemon, delegate and council workers, the CLI). The
 * engine DMs it to the configured owner like every other card: the run's
 * task as quoted data first, then the card — the action (one model call to
 * <model> via <provider>), the target (the tripped cap scope(s), `total` /
 * `provider:<id>`) and the amount (that call's estimate). The class is
 * `money`, so Approve also needs the one-time code (SAFE-19). Approve only
 * records the decision: the waiting run reads it, uses it once, and sends
 * exactly that call at that amount (SAFE-8.a); the next call past the cap
 * raises a new card and code. Deny, no answer in time, a late code, or a
 * waiting run that is gone (its `<pid>:<proc start>`) is a no (SAFE-20):
 * nothing is spent. Amounts stay on the owner's DM card; channels and the
 * requester only ever see "Work is paused for budget." (SAFE-14.a).
 */

import type { Database } from "bun:sqlite";
import { SPEND_CARD_CLASS, SPEND_CARD_KIND } from "../agent/spend.ts";
import type { ApprovalRequest } from "../approvals/store.ts";
import { storedApprovalKind, type ApprovalKind } from "./approval-cards.ts";

/** What a no leaves undone, on the card. */
export const SPEND_CARD_NOTHING_DONE = "nothing was spent";

/** The card's outcome line after Approve and the right code. */
export const SPEND_CARD_APPROVED =
  "Approved by you — the waiting run sends exactly this one call; the next call past the cap asks again (SAFE-8.a).";

/** The `spend` card kind (class money) for the bridge's card engine. */
export function spendApprovalKind(opts: { db: Database; now?: () => number }): ApprovalKind<ApprovalRequest, void> {
  return storedApprovalKind({
    db: opts.db,
    kind: SPEND_CARD_KIND,
    class: SPEND_CARD_CLASS,
    audit: "spend-cap",
    nothingDone: SPEND_CARD_NOTHING_DONE,
    approvedOutcome: () => SPEND_CARD_APPROVED,
    ...(opts.now ? { now: opts.now } : {}),
  });
}
