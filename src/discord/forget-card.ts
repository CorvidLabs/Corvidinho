/**
 * MEMORY-ACL-6 — forget on request, approved by the owner on a DM card (#101).
 *
 * `memory-forget-me` records the ask (`forget_requests`, src/memory/forget.ts)
 * from a conversation with the person. The bridge then, on every scheduler
 * tick and right after a chat run:
 * - DMs the configured owner an Approve/Deny card (src/discord/approve-card.ts)
 *   naming who asked, exactly what would be deleted (how many memories; no
 *   content) and when an unanswered card lapses;
 * - closes asks nobody answered in time as a no (expired), marking the card;
 * - tells each asker the outcome by DM, else in the conversation they asked
 *   in while it is still allowlisted (mentioning only them).
 *
 * A press counts only from the configured owner (re-checked at press time:
 * not muted, not deny-listed) on a still-pending, unexpired ask; a late press
 * is a no. Approve writes a SAFE-5 `started` row first (no row ⇒ nothing is
 * deleted, fail closed), then — in one transaction that also closes the ask —
 * deletes every memory row of that person (profile, notes, private notes,
 * soft-deleted history) and the stored turns of their Discord sessions, and
 * confirms to both. Deny closes it as a no. Every step is audited (ids and
 * digests only). The people list entry is never touched (only the owner
 * edits it, IDENTITY-6).
 */

import type { Database } from "bun:sqlite";
import { appendAudit, argsDigest, auditKeyFromEnv, type AuditOutcome } from "../audit/log.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import type { PeopleDirectory } from "../identity/people.ts";
import {
  FORGET_REQUEST_TTL_MS,
  ForgetRequestStore,
  forgetMemoryTargets,
  forgetTargets,
  MemoryStore,
  memorySubjectForRef,
  subjectLabel,
  type ForgetRequest,
} from "../memory/index.ts";
import {
  buildApproveDenyComponents,
  formatApproveCard,
  formatDecidedCard,
  isApproveCardExpired,
  type ParsedApproveCardId,
} from "./approve-card.ts";
import type { ComponentInteraction } from "./gateway.ts";

/** Card kind in the button custom_id (`cvok:forget:…`). */
export const FORGET_CARD_KIND = "forget";

export const FORGET_CARD_TITLE = "Forget request (MEMORY-ACL-6)";

export const FORGET_NOT_OWNER = "Only the owner can answer this card.";

export type ForgetCardDeps = {
  db: Database;
  env?: NodeJS.ProcessEnv;
  /** The configured owner, read now. */
  owner: () => OwnerRecord | null;
  /** The owner's people list, read now. */
  people: () => PeopleDirectory | null;
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
  /** Fallback outcome notice in the asker's conversation. */
  post?: (opts: { channelId: string; content: string; mentionUserIds?: string[] }) => Promise<boolean>;
  /** May the fallback post go to this conversation (still allowlisted)? */
  mayPost?: (channelId: string, parentChannelId?: string) => boolean;
  now?: () => number;
};

export type ForgetDeliveryResult = { posted: number; expired: number; notified: number };

export type ForgetCards = {
  /** One delivery pass (cards, expiries, outcome notices). Never throws. */
  deliver(): Promise<ForgetDeliveryResult>;
  /**
   * A press on a forget card. `mayDecide`: the presser is the configured
   * owner, not muted or deny-listed (checked by the bridge at press time).
   */
  press(interaction: ComponentInteraction, parsed: ParsedApproveCardId, mayDecide: boolean): Promise<void>;
};

function who(req: ForgetRequest, dir: PeopleDirectory | null): string {
  if (req.subjectKind === "person") {
    const s = memorySubjectForRef(dir, req.subjectId);
    return s && s.kind === "person" ? `${subjectLabel(s)}, ${s.role}` : `${req.subjectId} (no longer on your people list)`;
  }
  return `<@${req.subjectId}> (not on your people list)`;
}

/** Card text (counts only, never content); `stored` null once decided. */
export function forgetCardText(req: ForgetRequest, dir: PeopleDirectory | null, stored: number | null): string {
  const where = req.originChannelId ? ` in <#${req.originChannelId}>` : "";
  return formatApproveCard({
    title: FORGET_CARD_TITLE,
    lines: [
      `Who: ${who(req, dir)} — asked by <@${req.requesterUserId}>${where}`,
      `Approve deletes, for good, everything I remember about them: their profile (projects, preferences, history), notes and private notes${stored === null ? "" : ` (${stored} stored)`}, and the turns of their open Discord sessions`,
      "Kept: their entry on your people list (only you edit it) and the audit trail",
      `Request: ${req.id}`,
    ],
    expiresAt: req.expiresAt,
  });
}

/** The asker's outcome notice. */
export function forgetOutcomeText(req: ForgetRequest): string {
  if (req.status === "approved") {
    return `Your forget request (${req.id}) was approved: I deleted everything I remembered about you (${req.forgottenCount ?? 0} memories and your stored conversation turns).`;
  }
  if (req.status === "denied") {
    return `The owner did not approve your forget request (${req.id}), so nothing was forgotten.`;
  }
  return `Your forget request (${req.id}) got no answer in time, so nothing was forgotten. You can ask again.`;
}

export function createForgetCards(deps: ForgetCardDeps): ForgetCards {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const store = new ForgetRequestStore({ db: deps.db, now });
  let passing: Promise<ForgetDeliveryResult> | null = null;

  const audit = (action: string, actor: string, req: ForgetRequest, outcome: AuditOutcome) =>
    appendAudit(
      deps.db,
      { action, actor, surface: "discord:forget-card", argsDigest: argsDigest([req.id]), outcome },
      { key: auditKeyFromEnv(env), now: now() },
    );
  const auditBestEffort = (action: string, actor: string, req: ForgetRequest, outcome: AuditOutcome) => {
    try {
      audit(action, actor, req, outcome);
    } catch (err) {
      console.error(`[discord] forget card: could not record ${outcome} for ${action}: ${err instanceof Error ? err.message : err}`);
    }
  };

  const storedCount = (req: ForgetRequest): number => {
    const t = forgetTargets(req, deps.people());
    const counts = new MemoryStore({ db: deps.db }).countByCategory(t.scopes);
    return Object.values(counts).reduce((n, v) => n + v, 0);
  };

  const closeCard = async (req: ForgetRequest, outcome: string) => {
    if (!req.cardChannelId || !req.cardMessageId || !deps.editMessage) return;
    try {
      await deps.editMessage({
        channelId: req.cardChannelId,
        messageId: req.cardMessageId,
        content: formatDecidedCard(forgetCardText(req, deps.people(), null), outcome),
        components: [],
      });
    } catch {
      /* the card keeps its buttons; a press on it is answered as closed */
    }
  };

  /** Tell the asker; true when it went out (DM, else their conversation). */
  const notify = async (req: ForgetRequest): Promise<boolean> => {
    const text = forgetOutcomeText(req);
    if (deps.sendDm) {
      try {
        if (await deps.sendDm({ userId: req.requesterUserId, content: text })) return true;
      } catch {
        /* fall back */
      }
    }
    if (deps.post && req.originChannelId && deps.mayPost?.(req.originChannelId, req.originParentChannelId)) {
      try {
        return await deps.post({
          channelId: req.originChannelId,
          content: `<@${req.requesterUserId}> ${text}`,
          mentionUserIds: [req.requesterUserId],
        });
      } catch {
        return false;
      }
    }
    return false;
  };

  const notifyAndMark = async (req: ForgetRequest): Promise<boolean> => {
    const ok = await notify(req);
    const giveUp = (req.decidedAt ?? req.createdAt) + FORGET_REQUEST_TTL_MS <= now();
    if (ok || giveUp) {
      store.markNotified(req.id);
      if (!ok) console.warn(`[discord] forget request ${req.id}: could not tell the asker the outcome; gave up`);
    }
    return ok;
  };

  const pass = async (): Promise<ForgetDeliveryResult> => {
    const result: ForgetDeliveryResult = { posted: 0, expired: 0, notified: 0 };
    // No answer in time ⇒ no.
    for (const req of store.expiredPending(now())) {
      if (!store.decide(req.id, "expired")) continue;
      result.expired += 1;
      auditBestEffort("memory-forget-expire", req.requesterUserId, req, "denied");
      await closeCard(req, "Expired — no answer, so nothing was forgotten.");
    }
    const owner = deps.owner();
    if (owner && deps.sendDm) {
      for (const req of store.undelivered(now())) {
        const sent = await deps.sendDm({
          userId: owner.discordId,
          content: forgetCardText(req, deps.people(), storedCount(req)),
          components: buildApproveDenyComponents(FORGET_CARD_KIND, req.id),
        });
        if (!sent) continue;
        store.markCardPosted(req.id, sent.channelId, sent.messageId);
        result.posted += 1;
        auditBestEffort("memory-forget-card", req.requesterUserId, req, "ok");
      }
    }
    for (const req of store.unnotified()) {
      if (await notifyAndMark(req)) result.notified += 1;
    }
    return result;
  };

  return {
    deliver() {
      if (passing) return passing;
      passing = pass()
        .catch((err) => {
          console.error(`[discord] forget card pass failed: ${err instanceof Error ? err.message : err}`);
          return { posted: 0, expired: 0, notified: 0 };
        })
        .finally(() => {
          passing = null;
        });
      return passing;
    },

    async press(interaction, parsed, mayDecide) {
      const req = store.get(parsed.id);
      const actor = interaction.userId;
      if (!mayDecide) {
        if (req) auditBestEffort(`memory-forget-${parsed.decision}`, actor, req, "denied");
        await interaction.reply({ content: FORGET_NOT_OWNER, ephemeral: true });
        return;
      }
      if (!req) {
        await interaction.reply({ content: "This forget request is unknown.", ephemeral: true });
        return;
      }
      const update = (content: string) => interaction.reply({ content, components: [], update: true });
      const cardNow = () => forgetCardText(req, deps.people(), null);
      if (req.status !== "pending") {
        await update(formatDecidedCard(cardNow(), `Already closed (${req.status}).`));
        return;
      }
      if (isApproveCardExpired(req.expiresAt, now())) {
        // A late answer is a no.
        if (store.decide(req.id, "expired")) {
          auditBestEffort("memory-forget-expire", req.requesterUserId, req, "denied");
        }
        await update(formatDecidedCard(cardNow(), "Expired — no answer in time, so nothing was forgotten."));
        const closed = store.get(req.id);
        if (closed) await notifyAndMark(closed);
        return;
      }
      if (parsed.decision === "deny") {
        if (!store.decide(req.id, "denied", { by: actor })) {
          await update(formatDecidedCard(cardNow(), "Already closed."));
          return;
        }
        auditBestEffort("memory-forget-deny", actor, req, "ok");
        const closed = store.get(req.id)!;
        const told = await notifyAndMark(closed);
        await update(
          formatDecidedCard(cardNow(), `Denied by you — nothing was forgotten.${told ? " They have been told." : " They could not be told yet."}`),
        );
        return;
      }
      // Approve: SAFE-5 started row first; no row ⇒ nothing is deleted.
      try {
        audit("memory-forget-approve", actor, req, "started");
      } catch (err) {
        await interaction.reply({
          content: `Audit log unavailable (SAFE-5) — nothing was forgotten; the request stays open. ${err instanceof Error ? err.message : ""}`.trim(),
          ephemeral: true,
        });
        return;
      }
      let deleted: { memories: number; turns: number } | null = null;
      try {
        const targets = forgetTargets(req, deps.people());
        deps.db
          .transaction(() => {
            if (!store.decide(req.id, "approved", { by: actor })) return;
            deleted = forgetMemoryTargets(deps.db, targets);
            deps.db.run(`UPDATE forget_requests SET forgotten_count = ? WHERE id = ?`, [deleted.memories, req.id]);
          })
          .immediate();
      } catch (err) {
        auditBestEffort("memory-forget-approve", actor, req, "error");
        await interaction.reply({
          content: `Forget failed — nothing was forgotten; the request stays open: ${err instanceof Error ? err.message : String(err)}`,
          ephemeral: true,
        });
        return;
      }
      if (!deleted) {
        auditBestEffort("memory-forget-approve", actor, req, "denied");
        await update(formatDecidedCard(cardNow(), "Already closed."));
        return;
      }
      const done: { memories: number; turns: number } = deleted;
      auditBestEffort("memory-forget-approve", actor, req, "ok");
      const closed = store.get(req.id)!;
      const told = await notifyAndMark(closed);
      await update(
        formatDecidedCard(
          cardNow(),
          `Approved by you — forgot ${done.memories} memories and ${done.turns} conversation turns.${told ? " They have been told." : " They could not be told yet."}`,
        ),
      );
    },
  };
}
