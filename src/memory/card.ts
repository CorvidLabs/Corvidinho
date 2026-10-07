/**
 * SAFE-18.a (Leif's 2026-09-28 interview, round 17): "My own memory forget
 * and override by id ask me on a DM card with Approve and a one-time code,
 * and an override shows the new text word for word."
 *
 * The card is SAFE-4's two-phase confirm for `memory-forget` and
 * `memory-override` (plugins/memory/commands.ts); it replaces the typed
 * confirm token. {@link askMemoryCard} records one `memory` request on the
 * shared approvals store (src/approvals/store.ts) — class destructive, so
 * Approve also needs the SAFE-19 one-time code — showing the exact action
 * (forget or override), the target (the memory's id, category/key, owner
 * scope and when it last changed), the amount (one memory, no money) and,
 * for an override, the new text word for word as the text sent before the
 * card. That text is SAFE-6 scrubbed as it is recorded, the same scrub the
 * memory store applies when it writes, so the card shows exactly what would
 * be stored. The running Discord bridge DMs the card to the owner on its
 * card engine (src/discord/approval-cards.ts `memoryApprovalKind`; text
 * fence-safe like every card). The run waits in-process and goes ahead only
 * on an approval it uses once ({@link ApprovalStore.consume}); Deny, no
 * answer before the card lapses, a gone waiting run or a stopped run is a
 * no and nothing changes (SAFE-20).
 */

import type { Database } from "bun:sqlite";
import {
  ApprovalStore,
  type ApprovalClass,
  type ApprovalRequest,
} from "../approvals/store.ts";
import { scheduleRunnerId } from "../scheduler/store.ts";
import type { MemoryRecord } from "./types.ts";

/** Card kind in the button custom_id (`cvok:memory:…`). */
export const MEMORY_CARD_KIND = "memory";
/** Destructive: Approve also needs the one-time code (SAFE-19). */
export const MEMORY_CARD_CLASS: ApprovalClass = "destructive";
/** How long the card stays open; no answer by then is a no (SAFE-20). */
export const MEMORY_CARD_TTL_MS = 5 * 60 * 1000;
/** How often the waiting run reads the decision from the shared DB. */
export const MEMORY_CARD_POLL_MS = 1000;
/** What a no leaves undone, on the card (`nothingDone`). */
export const MEMORY_CARD_NOTHING_DONE = "nothing was forgotten or changed";

export type MemoryCardOp = "forget" | "override";

/** What the card shows (SAFE-18). */
export type MemoryCardFields = {
  title: string;
  action: string;
  target: string;
  amount: string;
  /** Override only: the new text, word for word. */
  text?: string;
};

/**
 * The card's fields for `op` on `row` (`content`: the override's new text;
 * `surface`: where it was asked, e.g. `discord:sess_…`).
 */
export function memoryCardFields(
  op: MemoryCardOp,
  row: Pick<MemoryRecord, "id" | "category" | "key" | "ownerUserId" | "updatedAt">,
  content: string | undefined,
  surface: string,
): MemoryCardFields {
  const target =
    `memory ${row.id} — ${row.category}/${row.key}, owner scope ${row.ownerUserId}, ` +
    `last changed ${new Date(row.updatedAt).toISOString()}`;
  if (op === "forget") {
    return {
      title: `Forget a memory by id (SAFE-18.a) · from ${surface}`,
      action: "memory-forget: forget this memory (soft delete; it is no longer recalled)",
      target,
      amount: "1 memory (no money)",
    };
  }
  return {
    title: `Override a memory by id (SAFE-18.a) · from ${surface}`,
    action: "memory-override: replace this memory's text with the text above, word for word",
    target,
    amount: "1 memory (no money)",
    text: content ?? "",
  };
}

/** Test seams: a short card lifetime and poll, and a hook right after a card is recorded. */
export type MemoryCardTestHooks = {
  ttlMs?: number;
  pollMs?: number;
  onRequest?: (req: ApprovalRequest, db: Database) => void;
};

let testHooks: MemoryCardTestHooks = {};

/** Tests only: set (or clear with `{}`) the card's seams. Returns the previous ones. */
export function setMemoryCardTestHooks(hooks: MemoryCardTestHooks): MemoryCardTestHooks {
  const prev = testHooks;
  testHooks = hooks;
  return prev;
}

export type MemoryCardAnswer =
  /** The owner approved with the code and this run used the approval (once). */
  | { approved: true; requestId: string }
  /** Denied, no answer in time (or nobody waiting), or the run was stopped: nothing changes. */
  | { approved: false; outcome: "denied" | "expired" | "aborted"; requestId: string };

/**
 * Record the owner's card for `op` on `row` and wait for the answer. The
 * card is the request's whole binding: what it shows is hashed (SAFE-18),
 * and the code counts only for that hash (SAFE-19).
 */
export async function askMemoryCard(input: {
  db: Database;
  op: MemoryCardOp;
  row: MemoryRecord;
  content?: string;
  requester: string;
  surface: string;
  signal?: AbortSignal;
}): Promise<MemoryCardAnswer> {
  const store = new ApprovalStore({ db: input.db });
  const f = memoryCardFields(input.op, input.row, input.content, input.surface);
  const req = store.request({
    kind: MEMORY_CARD_KIND,
    class: MEMORY_CARD_CLASS,
    title: f.title,
    action: f.action,
    target: f.target,
    amount: f.amount,
    ...(f.text !== undefined ? { text: f.text, textLabel: "text" as const } : {}),
    requester: input.requester,
    waiter: scheduleRunnerId(),
    ttlMs: testHooks.ttlMs ?? MEMORY_CARD_TTL_MS,
  });
  testHooks.onRequest?.(req, input.db);
  const decided = await store.waitForDecision(req.id, {
    pollMs: testHooks.pollMs ?? MEMORY_CARD_POLL_MS,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  // A run stopped while the owner approved changes nothing: the approval is
  // left unused and the stop wins.
  if (decided?.status === "approved" && !input.signal?.aborted && store.consume(req.id)) {
    return { approved: true, requestId: req.id };
  }
  if (decided?.status === "denied") return { approved: false, outcome: "denied", requestId: req.id };
  if (input.signal?.aborted) return { approved: false, outcome: "aborted", requestId: req.id };
  return { approved: false, outcome: "expired", requestId: req.id };
}
