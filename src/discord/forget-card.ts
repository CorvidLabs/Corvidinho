/**
 * MEMORY-ACL-6 — forget on request, approved by the owner on a DM card (#101).
 *
 * `memory-forget-me` records the ask (`forget_requests`, src/memory/forget.ts)
 * from a conversation with the person. The ask is the `forget` kind of the
 * Approve/Deny card engine (src/discord/approval-cards.ts, SAFE-18..20):
 * class destructive, so Approve also needs a one-time code (SAFE-19). The
 * engine's delivery pass (its own poll, right after a chat run, and on
 * scheduler ticks):
 * - DMs the configured owner the card: the exact action (delete, for good,
 *   their memory …), the target (who, and who asked where), the amount (how
 *   many memories, session turns and kept conversations — no content; the
 *   same statements Approve runs, rolled back, `previewForgetTargets`), what
 *   is kept, and when an unanswered card lapses;
 * - closes asks nobody answered in time as a no (expired), marking the card;
 * - tells each asker the outcome by DM, else in the conversation they asked
 *   in while it is still allowlisted (mentioning only them).
 *
 * A press or code submit counts only from the configured owner (re-checked
 * every time: not muted, not deny-listed) on a still-pending, unexpired ask;
 * a late press is a no. Approve checks that the targets and counts are still
 * the ones the card showed (else nothing is deleted and a fresh card
 * follows), sends a one-time code, and on the right code writes a SAFE-5
 * `started` row first (no row ⇒ nothing is deleted, fail closed), then — in
 * one transaction that also closes the ask and re-checks the counts —
 * deletes every memory row of that person (profile, notes, private notes,
 * soft-deleted history), the stored turns of their Discord sessions and
 * their kept conversations (30-day summaries, AGENT-6.a), and confirms to
 * both. Deny closes it as a no. Every step is audited (ids and digests
 * only). The people list entry is never touched (only the owner edits it,
 * IDENTITY-6).
 *
 * MEMORY-ACL-6.a: the same card answers an ask a declared person made on
 * GitHub (src/watch/forget-me.ts; the card says so and names the thread) and
 * one the owner started with `/admin people forget`. A GitHub asker is told
 * the outcome on their thread by the WATCH poller, never here; an ask the
 * owner started tells nobody else (the card shows the outcome).
 */

import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import type { OwnerRecord } from "../identity/owner.ts";
import type { PeopleDirectory } from "../identity/people.ts";
import {
  FORGET_REQUEST_TTL_MS,
  ForgetRequestStore,
  forgetMemoryTargets,
  forgetRequesterActor,
  forgetTargets,
  githubOriginOf,
  MemoryStore,
  memorySubjectForRef,
  previewForgetTargets,
  subjectLabel,
  type ForgetCounts,
  type ForgetRequest,
} from "../memory/index.ts";
import {
  APPROVAL_NOT_OWNER,
  createApprovalCards,
  type ApprovalCardView,
  type ApprovalCards,
  type ApprovalDeliveryResult,
  type ApprovalKind,
} from "./approval-cards.ts";

/** Card kind in the button custom_id (`cvok:forget:…`). */
export const FORGET_CARD_KIND = "forget";

export const FORGET_CARD_TITLE = "Forget request (MEMORY-ACL-6)";

export const FORGET_NOT_OWNER = APPROVAL_NOT_OWNER;

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
  /**
   * After an approved forget is committed: drop what the running bridge still
   * holds of these Discord users' conversations (the session threads a next
   * run would replay). Best effort; a throw is logged.
   */
  onForgotten?: (targets: { discordIds: readonly string[] }) => void;
  now?: () => number;
};

export type ForgetDeliveryResult = ApprovalDeliveryResult;

/** The engine with only the forget kind (tests and callers of #291's API). */
export type ForgetCards = Pick<ApprovalCards, "deliver" | "press">;

function who(req: ForgetRequest, dir: PeopleDirectory | null): string {
  if (req.subjectKind === "person") {
    const s = memorySubjectForRef(dir, req.subjectId);
    return s && s.kind === "person" ? `${subjectLabel(s)}, ${s.role}` : `${req.subjectId} (no longer on your people list)`;
  }
  return `<@${req.subjectId}> (not on your people list)`;
}

/** Who asked and where (MEMORY-ACL-6 / MEMORY-ACL-6.a). */
function askedBy(req: ForgetRequest): string {
  const r = req.requester;
  if (r.via === "admin") return "started by you with /admin people forget";
  if (r.via === "github") {
    const thread = githubOriginOf(req);
    const where = thread ? ` in ${thread.repo}#${thread.number}` : "";
    return `asked on GitHub by @${r.login} (GitHub account id ${r.githubId})${where}`;
  }
  const where = req.originChannelId ? ` in <#${req.originChannelId}>` : "";
  return `asked by <@${r.discordId}>${where}`;
}

const FORGET_ACTION =
  "Delete, for good, their memory: their profile (projects, preferences, history), notes and private notes, the turns of their open Discord sessions, and their kept conversations (30-day summaries)";
const FORGET_KEPT =
  "Kept: their entry on your people list (only you edit it), project memory, what others stored in their own memory, their schedules and /work records, and the audit trail";

type ForgetTargetSet = ReturnType<typeof forgetTargets>;

/** SAFE-18: the exact action — who, every target id and every count. */
function forgetActionHash(req: ForgetRequest, targets: ForgetTargetSet, stored: number, counts: ForgetCounts): string {
  const sorted = (xs: readonly string[]) => [...xs].sort();
  return createHash("sha256")
    .update(
      JSON.stringify([
        "forget/v1",
        req.id,
        req.subjectKind,
        req.subjectId,
        sorted(targets.scopes),
        sorted(targets.discordIds),
        sorted(targets.githubLogins),
        sorted(targets.githubIds),
        stored,
        counts.memories,
        counts.turns,
        counts.conversations,
      ]),
    )
    .digest("hex");
}

function amountText(stored: number, c: ForgetCounts): string {
  const older = Math.max(0, c.memories - stored);
  const memories = `${c.memories} memories (${stored} stored${older > 0 ? `, ${older} earlier versions` : ""})`;
  return `${memories}, ${c.turns} session turns and ${c.conversations} kept conversations`;
}

/** The asker's outcome notice. */
export function forgetOutcomeText(req: ForgetRequest): string {
  if (req.status === "approved") {
    return `Your forget request (${req.id}) was approved: I deleted your memory (${req.forgottenCount ?? 0} stored memories) and the turns of your open conversations with me and of the ones I kept.`;
  }
  if (req.status === "denied") {
    return `The owner did not approve your forget request (${req.id}), so nothing was forgotten.`;
  }
  return `Your forget request (${req.id}) got no answer in time, so nothing was forgotten. You can ask again.`;
}

type ForgetDone = {
  deleted: { memories: number; turns: number; conversations: number };
  discordIds: readonly string[];
};

/** The `forget` card kind (class destructive: Approve needs a one-time code). */
export function forgetApprovalKind(deps: ForgetCardDeps): ApprovalKind<ForgetRequest, ForgetDone> {
  const now = deps.now ?? Date.now;
  const store = new ForgetRequestStore({ db: deps.db, now });

  const live = (req: ForgetRequest) => {
    const targets = forgetTargets(req, deps.people());
    const counts = new MemoryStore({ db: deps.db }).countByCategory(targets.scopes);
    const stored = Object.values(counts).reduce((n, v) => n + v, 0);
    return { targets, stored };
  };

  const view = (req: ForgetRequest, amount: string): ApprovalCardView => ({
    title: FORGET_CARD_TITLE,
    action: FORGET_ACTION,
    target: `${who(req, deps.people())} — ${askedBy(req)}`,
    amount,
    notes: [FORGET_KEPT],
  });

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

  return {
    kind: FORGET_CARD_KIND,
    class: "destructive",
    audit: "memory-forget",
    surface: "discord:forget-card",
    nothingDone: "nothing was forgotten",
    failed: "Forget failed",
    store: {
      get: (id) => store.get(id),
      undelivered: (t) => store.undelivered(t),
      expiredPending: (t) => store.expiredPending(t),
      markCardPosted: (id, channelId, messageId, actionHash) =>
        store.markCardPosted(id, channelId, messageId, actionHash),
      resetCard: (id) => store.resetCard(id),
      decide: (id, status, o) => store.decide(id, status, o),
    },
    auditActor: (req) => forgetRequesterActor(req.requester),
    snapshot: (req) => {
      const { targets, stored } = live(req);
      const counts = previewForgetTargets(deps.db, targets);
      return {
        view: view(req, amountText(stored, counts)),
        actionHash: forgetActionHash(req, targets, stored, counts),
      };
    },
    summary: (req) => view(req, "as counted on the card when it was sent"),
    onApprove: (req) => {
      // Inside the engine's transaction: delete, then check it was exactly
      // what the card showed; anything else rolls it all back.
      const { targets, stored } = live(req);
      const deleted = forgetMemoryTargets(deps.db, targets);
      if (forgetActionHash(req, targets, stored, deleted) !== req.actionHash) {
        throw new Error("what would be deleted changed since the card was sent; press Approve for the current card");
      }
      deps.db.run(`UPDATE forget_requests SET forgotten_count = ? WHERE id = ?`, [deleted.memories, req.id]);
      return { deleted, discordIds: targets.discordIds };
    },
    afterApprove: (_req, done) => {
      // What the running bridge still holds of their conversations goes too.
      deps.onForgotten?.({ discordIds: done.discordIds });
    },
    approvedOutcome: (_req, done) => {
      // AGENT-6.a: kept conversations (30-day summaries) are counted when any went.
      const kept = done.deleted.conversations > 0 ? ` and ${done.deleted.conversations} kept conversations` : "";
      return `Approved by you — forgot ${done.deleted.memories} memories and ${done.deleted.turns} conversation turns${kept}.`;
    },
    /**
     * MEMORY-ACL-6.a: a Discord asker by DM or in their conversation; a
     * GitHub asker is left to the WATCH poller (their thread); an ask the
     * owner started needs nobody told (the card says it).
     */
    tell: async (req) => {
      if (req.requester.via === "admin") {
        store.markNotified(req.id);
        return { told: false, tail: null };
      }
      if (req.requester.via === "github") {
        return { told: false, tail: " They will be told on their GitHub thread." };
      }
      if (await notifyAndMark(req)) return { told: true, tail: " They have been told." };
      return { told: false, retry: true, tail: " They could not be told yet; I keep trying for a day." };
    },
    unnotified: () => store.unnotified(),
  };
}

/** The card engine with only the forget kind. */
export function createForgetCards(deps: ForgetCardDeps): ForgetCards {
  return createApprovalCards({
    db: deps.db,
    ...(deps.env ? { env: deps.env } : {}),
    owner: deps.owner,
    ...(deps.sendDm ? { sendDm: deps.sendDm } : {}),
    ...(deps.editMessage ? { editMessage: deps.editMessage } : {}),
    ...(deps.now ? { now: deps.now } : {}),
    kinds: [forgetApprovalKind(deps)],
  });
}
