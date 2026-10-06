/**
 * SAFE-18..20 — one Approve/Deny card engine for everything that needs the
 * owner's OK (#96, REQ-discord-096).
 *
 * A card kind registers with {@link createApprovalCards}: its store (the
 * requests, in SQLite, so any process can raise one and a restarted bridge
 * still knows them), its class — `plain`, `destructive` or `money`; a kind
 * with no class counts as destructive — what its card shows and the action
 * hash that binds it, what Approve does and how the asker is told. The
 * MEMORY-ACL-6 forget card is the `forget` kind (src/discord/forget-card.ts);
 * {@link storedApprovalKind} serves kinds whose requests live in
 * `approval_requests` (src/approvals/store.ts).
 *
 * One delivery pass (the engine's own ~5 s poll, started and stopped with
 * the bridge so it works with the scheduler off, plus a pass after each chat
 * run and on scheduler ticks; one pass at a time; never throws):
 * - closes every pending request past its expiry, or whose waiting process
 *   is gone, as a no (SAFE-20), marking its card;
 * - DMs the configured owner each undelivered card (SAFE-18): the diff or
 *   text first, verbatim, as quoted-data parts split fence-safe under the DM
 *   cap, then the card — the exact action, target and amount one line each,
 *   the request id and action hash, the expiry — with its buttons last. A
 *   card that would not fit (or a text over ten parts) is not sent (logged),
 *   never cut; a failed DM is retried after {@link APPROVAL_DM_RETRY_MS};
 * - tells each asker whose request was decided the outcome.
 *
 * Presses and the code form's submit count only from the owner, re-checked
 * by the bridge on every one (`mayDecide`). A closed request answers
 * "already closed"; one past its expiry, or nobody waits for, closes as a no.
 * Deny closes it (audited). Approve re-checks the action hash against what
 * the card showed — changed ⇒ nothing runs, the card closes and a fresh one
 * follows. A plain card then acts. A destructive or money card (SAFE-19)
 * first answers the press with Enter code / Deny and DMs a one-time code as
 * a separate message (src/approvals/code.ts; never in the card's message);
 * Enter code opens a form, and only its submit carries typed text. A right
 * code, for this card and the action it shows, before it expires, is used up
 * (committed); a wrong, other-action or late one voids the open code and
 * does nothing (a new Approve press gets a new code). Acting follows SAFE-5:
 * the `<audit>-approve` `started` row first (not written ⇒ nothing runs, the
 * request stays open), then one IMMEDIATE transaction that compare-and-sets
 * the request to approved and runs the kind's `onApprove`, then `ok` (or
 * `error`, the request left open — a used code does not come back, so a
 * retry needs a new one). Audit rows hold digests only; a code is never
 * logged or stored in the clear.
 */

import type { Database } from "bun:sqlite";
import { appendAudit, argsDigest, auditKeyFromEnv, type AuditOutcome } from "../audit/log.ts";
import {
  APPROVAL_CODE_TTL_MS,
  issueCode,
  purgeOldCodes,
  verifyAndConsume,
  voidCodes,
  type CodeRefusal,
  type IssuedCode,
} from "../approvals/code.ts";
import {
  ApprovalStore,
  approvalActionHash,
  approvalClassOf,
  classNeedsCode,
  storedApprovalAction,
  type ApprovalClass,
  type ApprovalRequest,
} from "../approvals/store.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { MUST_ASK_CARD_KINDS, MUST_ASK_NOTHING_DONE } from "../plugins/must-ask.ts";
import { isScheduleRunnerAlive } from "../scheduler/store.ts";
import {
  APPROVAL_CODE_INPUT_ID,
  buildApproveDenyComponents,
  buildCodeModal,
  buildCodeStepComponents,
  formatApprovalCard,
  formatApprovalTextParts,
  formatDecidedCard,
  isApproveCardExpired,
  type ParsedApproveCardId,
} from "./approve-card.ts";
import type { ComponentInteraction } from "./gateway.ts";

/** How often the running bridge runs a delivery pass. */
export const APPROVAL_POLL_MS = 5_000;
/** A card (or asker notice) whose DM failed is retried after this long. */
export const APPROVAL_DM_RETRY_MS = 60_000;
/** Spent and voided codes are purged at most this often. */
const CODE_PURGE_EVERY_MS = 60 * 60 * 1000;

export const APPROVAL_NOT_OWNER = "Only the owner can answer this card.";
export const APPROVAL_UNKNOWN_KIND = "This card is no longer handled.";

/** What the engine needs of a kind's request. */
export type ApprovalRecord = {
  id: string;
  status: string;
  expiresAt: number;
  cardChannelId?: string;
  cardMessageId?: string;
  /**
   * The action hash the card showed (set when it was posted). Missing on a
   * card sent before it was recorded (a forget card from before schema v14):
   * such a card binds nothing, so Approve treats it as changed.
   */
  actionHash?: string;
};

/** What a card shows (SAFE-18). */
export type ApprovalCardView = {
  title: string;
  action: string;
  target: string;
  amount: string;
  notes?: readonly string[];
  /** A diff or text, sent verbatim before the card. */
  text?: { label: "diff" | "text"; body: string };
};

export type ApprovalKindStore<R extends ApprovalRecord> = {
  get(id: string): R | undefined;
  /** Pending, still open, card not sent yet. */
  undelivered(now: number): R[];
  /** Pending past its expiry. */
  expiredPending(now: number): R[];
  /** Every pending request (for the waiter check). */
  pending?(): R[];
  markCardPosted(id: string, channelId: string, messageId: string, actionHash: string): void;
  /** The card went stale: the next pass sends a fresh one. */
  resetCard(id: string): void;
  /** Compare-and-set a pending request closed; false when it already was. */
  decide(id: string, status: "approved" | "denied" | "expired", opts?: { by?: string }): boolean;
};

/** How telling an asker went, and what the card should add (null: nothing). */
export type ApprovalTelling = { told: boolean; retry?: boolean; tail: string | null };

export type ApprovalKind<R extends ApprovalRecord = ApprovalRecord, A = unknown> = {
  /** The custom_id kind (`cvok:<kind>:…`). */
  kind: string;
  /** Missing ⇒ destructive (SAFE-19). */
  class?: ApprovalClass;
  /** SAFE-5 action prefix: `<audit>-card|-approve|-deny|-expire`. */
  audit: string;
  /** SAFE-5 surface of the kind's rows. */
  surface?: string;
  store: ApprovalKindStore<R>;
  /** Actor of a pass's rows (card, expiry). */
  auditActor(req: R): string;
  /** What the card shows now and the hash of that exact action (live). */
  snapshot(req: R): { view: ApprovalCardView; actionHash: string };
  /** What a closed card still shows (no live amounts). */
  summary(req: R): ApprovalCardView;
  /**
   * Before Approve acts (after the hash and code checks, before the SAFE-5
   * `started` row, outside the transaction): get what `onApprove` needs
   * ready (the hi card makes sure its session worktree is there). A throw
   * means nothing runs and the request stays open.
   */
  prepare?(req: R): Promise<void>;
  /** Runs inside the engine's IMMEDIATE transaction, after the compare-and-set to approved. */
  onApprove(req: R, actor: string): A;
  /** After the approval committed (best effort). */
  afterApprove?(req: R, result: A): void;
  approvedOutcome(req: R, result: A): string;
  /** "nothing was forgotten" — what a no leaves undone. */
  nothingDone: string;
  /** Start of the error reply when Approve fails ("Forget failed"). */
  failed?: string;
  /** True when nobody waits for the answer any more. */
  orphaned?(req: R): boolean;
  /** Tell a decided request's asker (null: nobody to tell). */
  tell?(req: R): Promise<ApprovalTelling>;
  /** Decided requests whose asker was not told yet. */
  unnotified?(): R[];
};

// Kinds are registered side by side; each keeps its own record type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyApprovalKind = ApprovalKind<any, any>;

export type ApprovalDeliveryResult = { posted: number; expired: number; notified: number };

export type ApprovalCardsDeps = {
  db: Database;
  env?: NodeJS.ProcessEnv;
  /** The configured owner, read now. */
  owner: () => OwnerRecord | null;
  sendDm?: (opts: {
    userId: string;
    content: string;
    components?: unknown[];
  }) => Promise<{ channelId: string; messageId: string } | null>;
  editMessage?: (opts: {
    channelId: string;
    messageId: string;
    content?: string | null;
    components?: unknown[] | null;
  }) => Promise<boolean>;
  kinds: readonly AnyApprovalKind[];
  now?: () => number;
  /** One-time code lifetime (tests). */
  codeTtlMs?: number;
  /** Retry delay after a failed DM (tests). */
  dmRetryMs?: number;
};

export type ApprovalCards = {
  /** One delivery pass (expiries, cards, outcome notices). Never throws. */
  deliver(): Promise<ApprovalDeliveryResult>;
  /**
   * A press on a card, or the code form's submit. `mayDecide`: the presser
   * is the configured owner, not muted or deny-listed (checked by the
   * bridge on every press and submit).
   */
  press(interaction: ComponentInteraction, parsed: ParsedApproveCardId, mayDecide: boolean): Promise<void>;
  /** Start the poll (idempotent; `pollMs` ≤ 0 ⇒ no poll). */
  start(pollMs?: number): void;
  stop(): void;
  /** Wait up to `ms` for a pass in flight. */
  settle(ms: number): Promise<void>;
  has(kind: string): boolean;
};

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function codeRefusalText(reason: CodeRefusal, nothingDone: string): string {
  const why =
    reason === "none"
      ? "There is no open code for this card"
      : reason === "expired"
        ? "That code expired"
        : reason === "other-action"
          ? "That code was for a different action"
          : "That code is not right";
  return `${why} — ${nothingDone}. The code no longer works; press Approve for a new one.`;
}

function codeDmText(requestId: string, actionHash: string, issued: IssuedCode): string {
  return [
    `One-time code for request ${requestId} (action ${actionHash.slice(0, 8)}): **${issued.code}**`,
    `Press **Enter code** on the card and type it. It works once, only for this action, until <t:${Math.floor(issued.expiresAt / 1000)}:R>. Never share it.`,
  ].join("\n");
}

export function createApprovalCards(deps: ApprovalCardsDeps): ApprovalCards {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const codeTtlMs = deps.codeTtlMs ?? APPROVAL_CODE_TTL_MS;
  const retryMs = deps.dmRetryMs ?? APPROVAL_DM_RETRY_MS;
  const registry = new Map<string, AnyApprovalKind>(deps.kinds.map((k) => [k.kind, k]));
  /** Earliest next try of a failed DM, by `<what>:<kind>:<id>`. */
  const retryAt = new Map<string, number>();
  /** Askers being told right now (a press and a pass never both tell). */
  const telling = new Set<string>();
  let passing: Promise<ApprovalDeliveryResult> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let purgedAt = Number.NEGATIVE_INFINITY;

  const needsCode = (k: AnyApprovalKind) => classNeedsCode(approvalClassOf(k.class));

  const audit = (
    k: AnyApprovalKind,
    action: string,
    actor: string,
    req: ApprovalRecord,
    outcome: AuditOutcome,
    extra: readonly string[] = [],
  ) =>
    appendAudit(
      deps.db,
      {
        action,
        actor,
        surface: k.surface ?? "discord:approval-card",
        argsDigest: argsDigest([req.id, ...extra]),
        outcome,
      },
      { key: auditKeyFromEnv(env), now: now() },
    );
  const auditBestEffort = (
    k: AnyApprovalKind,
    action: string,
    actor: string,
    req: ApprovalRecord,
    outcome: AuditOutcome,
    extra: readonly string[] = [],
  ) => {
    try {
      audit(k, action, actor, req, outcome, extra);
    } catch (err) {
      console.error(`[discord] approval card: could not record ${outcome} for ${action}: ${errText(err)}`);
    }
  };
  const voidCodesSafe = (k: AnyApprovalKind, req: ApprovalRecord) => {
    try {
      voidCodes(deps.db, { kind: k.kind, requestId: req.id }, now());
    } catch (err) {
      console.error(`[discord] approval card ${k.kind} ${req.id}: could not void codes: ${errText(err)}`);
    }
  };

  /** Card text; a card that cannot be built shows its request id only. */
  const cardText = (
    k: AnyApprovalKind,
    req: ApprovalRecord,
    view: ApprovalCardView,
    actionHash: string,
    opts: { codeUntil?: number; extraNote?: string } = {},
  ): string => {
    try {
      const textParts = view.text
        ? { label: view.text.label, count: formatApprovalTextParts({ requestId: req.id, ...view.text }).length }
        : undefined;
      return formatApprovalCard({
        title: view.title,
        action: view.action,
        target: view.target,
        amount: view.amount,
        notes: opts.extraNote ? [...(view.notes ?? []), opts.extraNote] : view.notes,
        requestId: req.id,
        actionHash,
        needsCode: needsCode(k),
        ...(textParts ? { textParts } : {}),
        ...(opts.codeUntil !== undefined ? { codeUntil: opts.codeUntil } : {}),
        expiresAt: req.expiresAt,
      });
    } catch (err) {
      console.error(`[discord] approval card ${k.kind} ${req.id}: ${errText(err)}`);
      return `**Approval request ${req.id}**\nNo answer by <t:${Math.floor(req.expiresAt / 1000)}:R> means no.`;
    }
  };
  const summaryText = (k: AnyApprovalKind, req: ApprovalRecord) => {
    let view: ApprovalCardView;
    try {
      view = k.summary(req);
    } catch (err) {
      console.error(`[discord] approval card ${k.kind} ${req.id}: ${errText(err)}`);
      view = { title: `Approval request (${k.kind})`, action: "-", target: "-", amount: "-" };
    }
    return cardText(k, req, view, req.actionHash ?? "");
  };

  const editCard = async (
    req: ApprovalRecord,
    fallback: { channelId?: string; messageId?: string },
    content: string,
    components: unknown[],
  ): Promise<void> => {
    const channelId = req.cardChannelId ?? fallback.channelId;
    const messageId = req.cardMessageId ?? fallback.messageId;
    if (!deps.editMessage || !channelId || !messageId) return;
    try {
      await deps.editMessage({ channelId, messageId, content, components });
    } catch {
      /* the card keeps its buttons; a press on it is answered as closed */
    }
  };

  const sendDmSafe = async (opts: { userId: string; content: string; components?: unknown[] }) => {
    if (!deps.sendDm) return null;
    try {
      return await deps.sendDm(opts);
    } catch {
      return null;
    }
  };

  /** Tell a decided request's asker once at a time; null when nobody is told. */
  const tellOnce = async (k: AnyApprovalKind, req: ApprovalRecord): Promise<ApprovalTelling | null> => {
    if (!k.tell) return null;
    const key = `${k.kind}:${req.id}`;
    if (telling.has(key)) return null;
    telling.add(key);
    try {
      const told = await k.tell(req);
      if (told.retry) retryAt.set(`tell:${key}`, now() + retryMs);
      else retryAt.delete(`tell:${key}`);
      return told;
    } catch (err) {
      console.error(`[discord] approval card ${k.kind} ${req.id}: telling the asker failed: ${errText(err)}`);
      retryAt.set(`tell:${key}`, now() + retryMs);
      return null;
    } finally {
      telling.delete(key);
    }
  };

  /** Close a pending request as a no (expired / nobody waiting). */
  const closeAsNo = async (k: AnyApprovalKind, req: ApprovalRecord, outcome: string): Promise<boolean> => {
    if (!k.store.decide(req.id, "expired")) return false;
    voidCodesSafe(k, req);
    auditBestEffort(k, `${k.audit}-expire`, k.auditActor(req), req, "denied");
    await editCard(req, {}, formatDecidedCard(summaryText(k, req), outcome), []);
    return true;
  };

  /** DM the owner one card (its text parts first). True when it went out. */
  const post = async (k: AnyApprovalKind, req: ApprovalRecord, ownerId: string): Promise<boolean> => {
    const key = `dm:${k.kind}:${req.id}`;
    if ((retryAt.get(key) ?? 0) > now()) return false;
    let parts: string[];
    let card: string;
    let hash: string;
    let components: unknown[];
    try {
      components = buildApproveDenyComponents(k.kind, req.id);
      const snap = k.snapshot(req);
      hash = snap.actionHash;
      parts = snap.view.text ? formatApprovalTextParts({ requestId: req.id, ...snap.view.text }) : [];
      card = formatApprovalCard({
        title: snap.view.title,
        action: snap.view.action,
        target: snap.view.target,
        amount: snap.view.amount,
        ...(snap.view.notes ? { notes: snap.view.notes } : {}),
        requestId: req.id,
        actionHash: hash,
        needsCode: needsCode(k),
        ...(snap.view.text ? { textParts: { label: snap.view.text.label, count: parts.length } } : {}),
        expiresAt: req.expiresAt,
      });
    } catch (err) {
      // Never cut: a card that does not fit is not sent (and lapses as a no).
      console.error(`[discord] approval card ${k.kind} ${req.id} not sent: ${errText(err)}`);
      retryAt.set(key, now() + retryMs);
      return false;
    }
    for (const content of parts) {
      if (!(await sendDmSafe({ userId: ownerId, content }))) {
        retryAt.set(key, now() + retryMs);
        return false;
      }
    }
    const sent = await sendDmSafe({ userId: ownerId, content: card, components });
    if (!sent) {
      retryAt.set(key, now() + retryMs);
      return false;
    }
    retryAt.delete(key);
    k.store.markCardPosted(req.id, sent.channelId, sent.messageId, hash);
    auditBestEffort(k, `${k.audit}-card`, k.auditActor(req), req, "ok");
    return true;
  };

  const pass = async (): Promise<ApprovalDeliveryResult> => {
    const result: ApprovalDeliveryResult = { posted: 0, expired: 0, notified: 0 };
    if (now() - purgedAt >= CODE_PURGE_EVERY_MS) {
      try {
        purgeOldCodes(deps.db, now());
        purgedAt = now();
      } catch {
        /* next pass */
      }
    }
    for (const k of registry.values()) {
      // No answer in time ⇒ no (SAFE-20).
      for (const req of k.store.expiredPending(now())) {
        if (await closeAsNo(k, req, `Expired — no answer, so ${k.nothingDone}.`)) result.expired += 1;
      }
      // Nobody waits for the answer any more ⇒ no.
      for (const req of k.orphaned ? (k.store.pending?.() ?? []) : []) {
        if (!k.orphaned!(req)) continue;
        if (await closeAsNo(k, req, `Closed — nobody is waiting for this any more, so ${k.nothingDone}.`)) {
          result.expired += 1;
        }
      }
    }
    const owner = deps.owner();
    if (owner && deps.sendDm) {
      for (const k of registry.values()) {
        for (const req of k.store.undelivered(now())) {
          if (await post(k, req, owner.discordId)) result.posted += 1;
        }
      }
    }
    for (const k of registry.values()) {
      for (const req of k.unnotified?.() ?? []) {
        if ((retryAt.get(`tell:${k.kind}:${req.id}`) ?? 0) > now()) continue;
        if ((await tellOnce(k, req))?.told) result.notified += 1;
      }
    }
    return result;
  };

  const deliver = (): Promise<ApprovalDeliveryResult> => {
    if (passing) return passing;
    passing = pass()
      .catch((err) => {
        console.error(`[discord] approval card pass failed: ${errText(err)}`);
        return { posted: 0, expired: 0, notified: 0 };
      })
      .finally(() => {
        passing = null;
      });
    return passing;
  };

  const press = async (
    interaction: ComponentInteraction,
    parsed: ParsedApproveCardId,
    mayDecide: boolean,
  ): Promise<void> => {
    const k = registry.get(parsed.kind);
    if (!k) {
      await interaction.reply({ content: APPROVAL_UNKNOWN_KIND, ephemeral: true });
      return;
    }
    const req = k.store.get(parsed.id) as ApprovalRecord | undefined;
    const actor = interaction.userId;
    const verb = parsed.decision === "deny" ? "deny" : "approve";
    // DISCORD-7 / ADMIN-4: the owner, re-checked on every press and submit.
    if (!mayDecide) {
      if (req) auditBestEffort(k, `${k.audit}-${verb}`, actor, req, "denied");
      await interaction.reply({ content: APPROVAL_NOT_OWNER, ephemeral: true });
      return;
    }
    if (!req) {
      await interaction.reply({ content: "This request is unknown.", ephemeral: true });
      return;
    }
    const at = { channelId: interaction.channelId, messageId: interaction.messageId };
    const codeFlow = needsCode(k);
    // A button press may update its card; a form submit answers privately
    // and the card is edited separately (a submit cannot update it).
    const canUpdate = parsed.decision !== "submit";
    const reply = async (o: { content: string; components?: unknown[]; update?: boolean; ephemeral?: boolean }) => {
      try {
        await interaction.reply(o);
      } catch (err) {
        console.error(`[discord] approval card ${k.kind} ${req.id}: answering the press failed: ${errText(err)}`);
      }
    };
    /** Answer with the card closed (`outcome` appended) or, for a submit, privately. */
    const respondClosed = async (outcome: string) => {
      const text = formatDecidedCard(summaryText(k, req), outcome);
      if (canUpdate) {
        await reply({ content: text, components: [], update: true });
        return;
      }
      await reply({ content: outcome, ephemeral: true });
      await editCard(req, at, text, []);
    };
    /** Back to Approve / Deny on the card (a code is spent or failed). */
    const reopenCard = async (note: string) => {
      let text: string;
      try {
        const snap = k.snapshot(req);
        text = cardText(k, req, snap.view, snap.actionHash, { extraNote: note });
      } catch {
        text = summaryText(k, req);
      }
      await editCard(req, at, text, buildApproveDenyComponents(k.kind, req.id));
    };
    /** Decided: answer first (Discord's ~3 s), then tell the asker, then mark the card. */
    const settle = async (outcome: string) => {
      const closedText = (tail: string) => formatDecidedCard(summaryText(k, req), `${outcome}${tail}`);
      if (canUpdate) {
        await reply({ content: closedText(""), components: [], update: true });
      } else {
        await reply({ content: outcome, ephemeral: true });
        await editCard(req, at, closedText(""), []);
      }
      const closed = k.store.get(req.id) as ApprovalRecord | undefined;
      const told = closed ? await tellOnce(k, closed) : null;
      if (!told || told.tail === null) return;
      await editCard(req, at, closedText(told.tail), []);
    };
    const changed = async () => {
      voidCodesSafe(k, req);
      k.store.resetCard(req.id);
      auditBestEffort(k, `${k.audit}-approve`, actor, req, "denied");
      await respondClosed(
        `Changed since this card was sent — ${k.nothingDone}; a new card with the current details follows.`,
      );
      void deliver();
    };

    if (req.status !== "pending") {
      await respondClosed(`Already closed (${req.status}).`);
      return;
    }
    const lateOutcome = isApproveCardExpired(req.expiresAt, now())
      ? `Expired — no answer in time, so ${k.nothingDone}.`
      : k.orphaned?.(req)
        ? `Closed — nobody is waiting for this any more, so ${k.nothingDone}.`
        : null;
    if (lateOutcome) {
      // A late answer is a no.
      if (k.store.decide(req.id, "expired")) {
        auditBestEffort(k, `${k.audit}-expire`, k.auditActor(req), req, "denied");
      }
      voidCodesSafe(k, req);
      await respondClosed(lateOutcome);
      const closed = k.store.get(req.id) as ApprovalRecord | undefined;
      if (closed) await tellOnce(k, closed);
      return;
    }
    if (parsed.decision === "deny") {
      if (!k.store.decide(req.id, "denied", { by: actor })) {
        await respondClosed("Already closed.");
        return;
      }
      voidCodesSafe(k, req);
      auditBestEffort(k, `${k.audit}-deny`, actor, req, "ok");
      await settle(`Denied by you — ${k.nothingDone}.`);
      return;
    }
    if (parsed.decision === "code") {
      if (!codeFlow) {
        await reply({ content: "This card needs no code — press Approve.", ephemeral: true });
        return;
      }
      if (!interaction.showModal) {
        await reply({ content: "I can't open the code form here — press Enter code again from the card.", ephemeral: true });
        return;
      }
      await interaction.showModal(buildCodeModal(k.kind, req.id));
      return;
    }
    if (parsed.decision === "submit" && !codeFlow) {
      await reply({ content: "This card needs no code — press Approve.", ephemeral: true });
      return;
    }

    // Approve or a code: the action must still be the one the card showed.
    let snap: { view: ApprovalCardView; actionHash: string };
    try {
      snap = k.snapshot(req);
    } catch (err) {
      await reply({ content: `Could not check this request now — ${k.nothingDone}; it stays open: ${errText(err)}`, ephemeral: true });
      return;
    }
    // A card that recorded no hash (sent before v14) binds nothing: changed.
    if (snap.actionHash !== req.actionHash) {
      await changed();
      return;
    }

    if (parsed.decision === "approve" && codeFlow) {
      // SAFE-19: answer the press with the code step, then DM the code apart.
      let issued: IssuedCode;
      try {
        issued = issueCode(deps.db, {
          kind: k.kind,
          requestId: req.id,
          actionHash: snap.actionHash,
          cardExpiresAt: req.expiresAt,
          now: now(),
          ttlMs: codeTtlMs,
        });
      } catch (err) {
        await reply({ content: `Could not make a one-time code — ${k.nothingDone}; press Approve again: ${errText(err)}`, ephemeral: true });
        return;
      }
      await reply({
        content: cardText(k, req, snap.view, snap.actionHash, { codeUntil: issued.expiresAt }),
        components: buildCodeStepComponents(k.kind, req.id),
        update: true,
      });
      const dm = await sendDmSafe({ userId: actor, content: codeDmText(req.id, snap.actionHash, issued) });
      if (!dm) {
        voidCodesSafe(k, req);
        auditBestEffort(k, "approval-code-issue", actor, req, "error", [k.kind]);
        await reopenCard("I couldn't send you the one-time code — press Approve again for a new one.");
        return;
      }
      auditBestEffort(k, "approval-code-issue", actor, req, "ok", [k.kind]);
      return;
    }

    if (parsed.decision === "submit") {
      let check;
      try {
        check = verifyAndConsume(deps.db, {
          kind: k.kind,
          requestId: req.id,
          actionHash: snap.actionHash,
          code: interaction.modalValues?.[APPROVAL_CODE_INPUT_ID],
          now: now(),
        });
      } catch (err) {
        await reply({ content: `Could not check the code — ${k.nothingDone}; the request stays open: ${errText(err)}`, ephemeral: true });
        return;
      }
      if (!check.ok) {
        auditBestEffort(k, "approval-code-fail", actor, req, "denied", [k.kind, check.reason]);
        await reply({ content: codeRefusalText(check.reason, k.nothingDone), ephemeral: true });
        await reopenCard("The last code did not count — press Approve for a new one.");
        return;
      }
    }

    // Act (SAFE-5): `started` first, committed; no row ⇒ nothing runs.
    const again = codeFlow ? " Press Approve for a new code." : "";
    if (k.prepare) {
      try {
        await k.prepare(req);
      } catch (err) {
        auditBestEffort(k, `${k.audit}-approve`, actor, req, "error");
        await reply({
          content: `${k.failed ?? "It failed"} — ${k.nothingDone}; the request stays open.${again} ${errText(err)}`.trim(),
          ephemeral: true,
        });
        if (codeFlow) await reopenCard("The last code was used up — press Approve for a new one.");
        return;
      }
    }
    try {
      audit(k, `${k.audit}-approve`, actor, req, "started");
    } catch (err) {
      await reply({
        content: `Audit log unavailable (SAFE-5) — ${k.nothingDone}; the request stays open.${again} ${errText(err)}`.trim(),
        ephemeral: true,
      });
      if (codeFlow) await reopenCard("The last code was used up — press Approve for a new one.");
      return;
    }
    const out: { decided: boolean; result?: unknown } = { decided: false };
    try {
      deps.db
        .transaction(() => {
          if (!k.store.decide(req.id, "approved", { by: actor })) return;
          out.decided = true;
          out.result = k.onApprove(req, actor);
        })
        .immediate();
    } catch (err) {
      auditBestEffort(k, `${k.audit}-approve`, actor, req, "error");
      await reply({
        content: `${k.failed ?? "It failed"} — ${k.nothingDone}; the request stays open.${again} ${errText(err)}`.trim(),
        ephemeral: true,
      });
      if (codeFlow) await reopenCard("The last code was used up — press Approve for a new one.");
      return;
    }
    if (!out.decided) {
      auditBestEffort(k, `${k.audit}-approve`, actor, req, "denied");
      await respondClosed("Already closed.");
      return;
    }
    auditBestEffort(k, `${k.audit}-approve`, actor, req, "ok");
    voidCodesSafe(k, req);
    try {
      k.afterApprove?.(req, out.result);
    } catch (err) {
      console.error(`[discord] approval card ${k.kind} ${req.id}: after approve: ${errText(err)}`);
    }
    await settle(k.approvedOutcome(req, out.result));
  };

  return {
    deliver,
    press,
    start(pollMs = APPROVAL_POLL_MS) {
      if (timer || !(pollMs > 0)) return;
      timer = setInterval(() => void deliver(), pollMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    async settle(ms: number) {
      const inFlight = passing;
      if (!inFlight) return;
      await Promise.race([inFlight.then(() => undefined), Bun.sleep(ms)]);
    },
    has: (kind) => registry.has(kind),
  };
}

/**
 * A kind whose requests live in `approval_requests` (src/approvals/store.ts):
 * the card shows the stored action, target, amount and text; the action
 * hash is recomputed from the row and recorded when the card goes out, so a
 * row changed after that gets a fresh card on Approve; a request whose waiting
 * process is gone is closed as a no. `onApprove` runs inside the engine's
 * transaction (default: nothing — the waiting process reads the approval
 * and uses it once, `ApprovalStore.consume`).
 */
export function storedApprovalKind(opts: {
  db: Database;
  kind: string;
  class?: ApprovalClass;
  audit?: string;
  surface?: string;
  nothingDone?: string;
  failed?: string;
  onApprove?: (req: ApprovalRequest, actor: string) => void;
  approvedOutcome?: (req: ApprovalRequest) => string;
  now?: () => number;
}): ApprovalKind<ApprovalRequest, void> {
  const store = new ApprovalStore({ db: opts.db, now: opts.now });
  const view = (req: ApprovalRequest): ApprovalCardView => ({
    title: req.title,
    action: req.action,
    target: req.target,
    amount: req.amount,
    ...(req.text !== undefined ? { text: { label: req.textLabel ?? "text", body: req.text } } : {}),
  });
  const own = (req: ApprovalRequest | undefined) => (req && req.kind === opts.kind ? req : undefined);
  return {
    kind: opts.kind,
    ...(opts.class ? { class: opts.class } : {}),
    audit: opts.audit ?? "approval",
    surface: opts.surface ?? "discord:approval-card",
    nothingDone: opts.nothingDone ?? "nothing was done",
    ...(opts.failed ? { failed: opts.failed } : {}),
    store: {
      get: (id) => own(store.get(id)),
      undelivered: (t) => store.undelivered(opts.kind, t),
      expiredPending: (t) => store.expiredPending(opts.kind, t),
      pending: () => store.pending(opts.kind),
      markCardPosted: (id, channelId, messageId, actionHash) =>
        store.markCardPosted(id, channelId, messageId, actionHash),
      resetCard: (id) => store.resetCard(id),
      decide: (id, status, o) => store.decide(id, status, o),
    },
    auditActor: (req) => req.requester ?? `approval:${opts.kind}`,
    snapshot: (req) => ({ view: view(req), actionHash: approvalActionHash(storedApprovalAction(req)) }),
    summary: view,
    onApprove: (req, actor) => {
      opts.onApprove?.(req, actor);
    },
    approvedOutcome: (req) => opts.approvedOutcome?.(req) ?? "Approved by you.",
    orphaned: (req) => Boolean(req.waiter) && !isScheduleRunnerAlive(req.waiter!),
  };
}

/**
 * AUTONOMY-9/10 (#97): the must-ask gate's cards (src/plugins/must-ask.ts),
 * both stored in `approval_requests` — `mustask` (prod or deploys; class
 * destructive, so Approve also needs the one-time code, AUTONOMY-9.a) and
 * `mustask-post` (a channel post; class plain). Approve only records the
 * decision: the waiting run reads it and uses it once.
 */
export function mustAskApprovalKinds(opts: { db: Database; now?: () => number }): ApprovalKind<ApprovalRequest, void>[] {
  return MUST_ASK_CARD_KINDS.map((k) =>
    storedApprovalKind({
      db: opts.db,
      kind: k.kind,
      class: k.class,
      audit: k.kind,
      nothingDone: MUST_ASK_NOTHING_DONE,
      approvedOutcome: () => "Approved by you — the waiting run goes ahead with exactly this.",
      ...(opts.now ? { now: opts.now } : {}),
    }),
  );
}
