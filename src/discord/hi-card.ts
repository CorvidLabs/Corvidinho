/**
 * AGENT-18 hi drafts (#89) — the owner's `hi` card: the `hi` kind of the
 * Approve/Deny card engine (src/discord/approval-cards.ts, SAFE-18..20;
 * buttons `cvok:hi:<decision>:<id>`).
 *
 * A run's `hi-draft` call (src/agent/hi-drafts.ts) records a hi capture
 * request (src/agent/hi-capture-store.ts) in the shared DB and ends the run
 * blocked. The engine's delivery pass (its own poll, after each chat and
 * `/work` run, and on scheduler ticks) DMs the configured owner the card:
 * the exact `hi` commands first, verbatim, as quoted data, then the action
 * (capture N drafted criteria into hi/), the target (the project and the
 * session's branch, and who drafted them where) and the amount (the ids).
 * The class is plain: Approve needs no one-time code.
 *
 * Only Corvidinho's configured owner decides: the bridge re-checks every
 * press (`mayDecide`: the owner, not muted or deny-listed), and Approve
 * checks once more that the presser is the owner configured now. Nobody
 * else's press, and no reply anywhere, captures anything; no answer within
 * a day, or Deny, is a no. On Approve the engine first makes sure the
 * session worktree is there (re-created on its branch when it is gone, else
 * it fails closed and the request stays open), then — inside its
 * transaction, after its SAFE-5 `hi-capture-approve` `started` row — runs
 * `hi <ID> "<text>"` for each draft there, all or nothing, writes one SAFE-5
 * `hi-capture-criterion` row per criterion and records what changed under
 * hi/ for the hi guard. The asker gets one outcome post in the conversation
 * they asked in (still allowlisted), else a DM; it names ids only.
 */

import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import {
  HI_CAPTURE_TTL_MS,
  HiCaptureStore,
  type HiCaptureRequest,
} from "../agent/hi-capture-store.ts";
import { ensureHiCaptureWorktree, hiCaptureCommand, runHiCapture, type HiCaptureResult } from "../agent/hi-drafts.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import type { ApprovalCardView, ApprovalKind } from "./approval-cards.ts";

/** Card kind in the button custom_id (`cvok:hi:…`). */
export const HI_CARD_KIND = "hi";

export const HI_CARD_TITLE = "hi capture request (AGENT-18)";

/** What a no leaves undone, on the card. */
export const HI_CARD_NOTHING_DONE = "nothing was captured";

export type HiCardDeps = {
  db: Database;
  env?: NodeJS.ProcessEnv;
  /** The configured owner, read now. */
  owner: () => OwnerRecord | null;
  sendDm?: (opts: {
    userId: string;
    content: string;
    components?: unknown[];
  }) => Promise<{ channelId: string; messageId: string } | null>;
  /** The outcome post in the asker's conversation. */
  post?: (opts: { channelId: string; content: string; mentionUserIds?: string[] }) => Promise<boolean>;
  /** May the outcome post go to this conversation (still allowlisted)? */
  mayPost?: (channelId: string, parentChannelId?: string) => boolean;
  now?: () => number;
};

function surfaceLabel(surface: string): string {
  if (surface === "work") return "/work";
  if (surface === "session") return "/session start";
  if (surface === "ask") return "ask-answer";
  return "chat";
}

function drafter(req: HiCaptureRequest): string {
  const who = req.role === "owner" ? "your" : `<@${req.requester}>'s (team)`;
  return `${who} ${surfaceLabel(req.surface)} run`;
}

/** SAFE-18: what the card shows. */
export function hiCardView(req: HiCaptureRequest): ApprovalCardView {
  const n = req.drafts.length;
  return {
    title: HI_CARD_TITLE,
    action: `Capture ${n === 1 ? "1 drafted criterion" : `${n} drafted criteria`} into hi/ with the hi CLI, exactly as the commands above say`,
    target: `${req.project} on branch ${req.branch} — drafted in ${drafter(req)}`,
    amount: `${n === 1 ? "1 criterion" : `${n} criteria`}: ${req.drafts.map((d) => d.id).join(", ")}`,
    notes: [
      "Only you can approve; nothing is captured without your Approve, and no reply anywhere captures anything.",
      "Approve runs these commands in that session's worktree (re-created on its branch when it is gone; else nothing is captured).",
    ],
    text: { label: "text", body: req.drafts.map(hiCaptureCommand).join("\n") },
  };
}

/** SAFE-18: the exact action — the request, where it is captured and every draft. */
export function hiCardActionHash(req: HiCaptureRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "hi-capture/v1",
        req.id,
        req.repo,
        req.worktree,
        req.branch,
        req.head,
        req.drafts.map((d) => [d.id, d.text]),
        req.requester,
        req.role,
      ]),
    )
    .digest("hex");
}

/** The asker's outcome post (ids only, never the drafted text). */
export function hiCardOutcomeText(req: HiCaptureRequest): string {
  const drafted = `the drafted hi criteria (${req.drafts.map((d) => d.id).join(", ")}; request ${req.id})`;
  if (req.status === "approved") {
    const ids = (req.captured && req.captured.length > 0 ? req.captured : req.drafts.map((d) => d.id)).join(", ");
    return `The owner approved ${drafted}: captured ${ids} into hi/ on branch ${req.branch} (AGENT-18).`;
  }
  if (req.status === "denied") return `The owner did not approve ${drafted}, so nothing was captured (AGENT-18).`;
  return `Nobody answered the card for ${drafted} in time, so nothing was captured (AGENT-18).`;
}

/** The `hi` card kind (class plain) for the bridge's card engine. */
export function hiCaptureApprovalKind(deps: HiCardDeps): ApprovalKind<HiCaptureRequest, HiCaptureResult> {
  const now = deps.now ?? Date.now;
  const env = deps.env ?? process.env;
  const store = new HiCaptureStore({ db: deps.db, now });

  /** Tell the asker; true when it went out (their conversation, else a DM). */
  const notify = async (req: HiCaptureRequest): Promise<boolean> => {
    const text = hiCardOutcomeText(req);
    if (deps.post && req.originChannelId && deps.mayPost?.(req.originChannelId, req.originParentChannelId)) {
      try {
        if (
          await deps.post({
            channelId: req.originChannelId,
            content: `<@${req.requester}> ${text}`,
            mentionUserIds: [req.requester],
          })
        ) {
          return true;
        }
      } catch {
        /* fall back to a DM */
      }
    }
    if (deps.sendDm) {
      try {
        return Boolean(await deps.sendDm({ userId: req.requester, content: text }));
      } catch {
        return false;
      }
    }
    return false;
  };

  return {
    kind: HI_CARD_KIND,
    class: "plain",
    audit: "hi-capture",
    surface: "discord:hi-card",
    nothingDone: HI_CARD_NOTHING_DONE,
    failed: "Capture failed",
    store: {
      get: (id) => store.get(id),
      undelivered: (t) => store.undelivered(t),
      expiredPending: (t) => store.expiredPending(t),
      pending: () => store.pending(),
      markCardPosted: (id, channelId, messageId, actionHash) => store.markCardPosted(id, channelId, messageId, actionHash),
      resetCard: (id) => store.resetCard(id),
      decide: (id, status, o) => store.decide(id, status, o),
    },
    auditActor: (req) => req.requester,
    snapshot: (req) => ({ view: hiCardView(req), actionHash: hiCardActionHash(req) }),
    summary: hiCardView,
    prepare: async (req) => {
      await ensureHiCaptureWorktree(req);
    },
    onApprove: (req, actor) => {
      // The engine's own owner check ran on this press; the presser must
      // still be the owner configured now.
      const owner = deps.owner();
      if (!owner || owner.discordId !== actor) {
        throw new Error("only Corvidinho's configured owner can approve a capture");
      }
      return runHiCapture({ db: deps.db, req, actor, env, now });
    },
    approvedOutcome: (req, done) =>
      `Approved by you — captured ${done.captured.join(", ")} into hi/ on branch ${req.branch} (AGENT-18).`,
    tell: async (req) => {
      const ok = await notify(req);
      const giveUp = (req.decidedAt ?? req.createdAt) + HI_CAPTURE_TTL_MS <= now();
      if (ok || giveUp) {
        store.markNotified(req.id);
        if (!ok) console.warn(`[discord] hi capture request ${req.id}: could not tell the asker the outcome; gave up`);
      }
      if (ok) return { told: true, tail: req.role === "owner" ? null : " They have been told." };
      return { told: false, retry: !giveUp, tail: giveUp ? null : " They could not be told yet; I keep trying for a day." };
    },
    unnotified: () => store.unnotified(),
  };
}
