/**
 * AUTONOMY-10 / AUTONOMY-10.a (#97) — its first 20 replies in public threads
 * each wait for the owner's OK on an Approve card.
 *
 * "It asks … before its first 20 replies in public threads" (AUTONOMY-10)
 * and "each of its first 20 public-thread replies waits for my OK, even text
 * I dictated and replies to me" (AUTONOMY-10.a). The channel-post half (every
 * `discord-post-message`) is the must-ask gate's (src/plugins/must-ask.ts);
 * this module is the replies half.
 *
 * - **Public thread.** A Discord `PublicThread` (a forum or media channel's
 *   posts are public threads too) or an `AnnouncementThread`, asked of the
 *   gateway at post time (`GatewayHandlers.isPublicThread`). A lookup that
 *   fails counts as public (fail closed); with no gateway that can tell (the
 *   dry-run null gateway) nothing is public.
 * - **Model text.** Only a post that carries model text is held: a run's
 *   answer, its question (a Choose stub, an Answer post, a restated question,
 *   a schedule's ask) and a schedule's result. Fixed harness text — the
 *   progress embed, "⏹ Stopped", the DISCORD-3.b failed-run lines, the
 *   spend-cap "Work is paused for budget." line, pings that only point at a
 *   post, acks and notices — is not.
 * - **The count.** `schema_meta` key {@link PUBLIC_REPLIES_APPROVED_KEY}
 *   holds how many held replies the owner approved (no schema change). While
 *   it is under {@link PUBLIC_THREAD_REPLY_LIMIT} every such post waits; an
 *   approval counts once, when the waiting bridge uses it. Denied, lapsed or
 *   stopped replies do not count. A value that cannot be read counts as 0.
 * - **The hold.** The post's place shows the fixed line
 *   {@link PUBLIC_REPLY_HOLD_LINE} (the run's progress message, else a short
 *   note in the thread), and a plain `reply` card (src/discord/approval-cards.ts
 *   engine, SAFE-18..20) is DMed to the owner with the reply text verbatim
 *   before it (scrubbed, fence-safe). Approve posts exactly the text the card
 *   showed; Deny, no answer within {@link PUBLIC_REPLY_CARD_TTL_MS}, a stop
 *   or the bridge closing posts none of it (SAFE-20) and the hold line becomes
 *   a fixed "Not posted — …" line. With no owner configured nothing can
 *   approve, so nothing is posted.
 * - **Files.** A run whose conversation channel still waits gets the
 *   per-spawn stamp {@link REPLY_PUBLIC_THREAD_ENV}=1, so `discord-send-file`
 *   asks on a must-ask card there too (plugins/discord/send-file.ts).
 */

import type { Database } from "bun:sqlite";
import { ApprovalStore, type ApprovalClass, type ApprovalRequest } from "../approvals/store.ts";
import type { OwnerRecord } from "../identity/owner.ts";
import { scheduleRunnerId } from "../scheduler/store.ts";
import { formatErrorLine, scrubSecrets } from "../store/scrub.ts";
import { storedApprovalKind, type ApprovalKind } from "./approval-cards.ts";

/** Discord API channel type `ANNOUNCEMENT_THREAD` (discord.js `ChannelType.AnnouncementThread`). */
export const DISCORD_ANNOUNCEMENT_THREAD_TYPE = 10;
/** Discord API channel type `PUBLIC_THREAD` (discord.js `ChannelType.PublicThread`). */
export const DISCORD_PUBLIC_THREAD_TYPE = 11;

/**
 * A channel type that is a public thread — `PublicThread` (forum and media
 * posts are public threads) or `AnnouncementThread`. `PrivateThread` (12),
 * every non-thread type and an unknown type are not. The live gateway's
 * `isPublicThread` answers with it.
 */
export function isPublicThreadType(type: unknown): boolean {
  return type === DISCORD_PUBLIC_THREAD_TYPE || type === DISCORD_ANNOUNCEMENT_THREAD_TYPE;
}

/** How many public-thread replies wait for the owner's OK (AUTONOMY-10). */
export const PUBLIC_THREAD_REPLY_LIMIT = 20;

/** `schema_meta` key: how many held public-thread replies the owner approved. */
export const PUBLIC_REPLIES_APPROVED_KEY = "public_thread_replies_approved";

/** The Approve card kind of a held reply (class plain: one press). */
export const PUBLIC_REPLY_KIND = "reply";
export const PUBLIC_REPLY_CLASS: ApprovalClass = "plain";

/** The fixed text a held reply shows where it will go. */
export const PUBLIC_REPLY_HOLD_TEXT = "waiting for the owner's OK before replying here";
/** The hold line as posted (progress message or note). */
export const PUBLIC_REPLY_HOLD_LINE = `⏳ ${PUBLIC_REPLY_HOLD_TEXT}`;

/**
 * The `/session start` and `/work` progress message's first line in a public
 * thread whose replies still wait: fixed text, so the topic or description
 * typed there is not shown before the owner's OK (it waits on the card with
 * the answer). Elsewhere the progress message names it as before.
 */
export const PUBLIC_REPLY_PROGRESS_TEXT = "Working on your request...";

/** How long a reply card stays open; no answer by then is a no (SAFE-20). */
export const PUBLIC_REPLY_CARD_TTL_MS = 5 * 60 * 1000;
/** How often the waiting bridge reads the decision. */
export const PUBLIC_REPLY_POLL_MS = 1000;

/** What a no leaves undone, on the card. */
export const PUBLIC_REPLY_NOTHING_DONE = "nothing was posted";
/** The card's outcome line after Approve. */
export const PUBLIC_REPLY_APPROVED = "Approved by you — the reply goes out exactly as shown.";

/**
 * Per-spawn stamp (`1` or empty, never inherited): this run's conversation
 * channel is a public thread whose replies still wait for the owner's OK.
 */
export const REPLY_PUBLIC_THREAD_ENV = "CORVIDINHO_DISCORD_REPLY_PUBLIC_THREAD";

/** Why a held reply was not posted. */
export type PublicReplyNo = "denied" | "expired" | "stopped" | "no-owner" | "unavailable";

/** The fixed line that replaces a reply that was not posted. */
export function publicReplyNotPostedText(outcome: PublicReplyNo): string {
  switch (outcome) {
    case "denied":
      return "Not posted — the owner didn't OK this reply.";
    case "expired":
      return "Not posted — no OK from the owner in time.";
    case "stopped":
      return "Not posted — stopped while waiting for the owner's OK.";
    case "no-owner":
      return "Not posted — no owner is configured to OK replies here.";
    case "unavailable":
      return "Not posted — the owner's Approve card could not be raised.";
  }
}

/** How many held public-thread replies the owner approved; unreadable ⇒ 0 (keep asking). */
export function approvedPublicReplies(db: Database): number {
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = ?")
    .get(PUBLIC_REPLIES_APPROVED_KEY) as { value: string } | null;
  const n = Number(row?.value ?? "0");
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Count one approved reply; returns the new count. */
export function countApprovedPublicReply(db: Database): number {
  const next = approvedPublicReplies(db) + 1;
  db.run(
    `INSERT INTO schema_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [PUBLIC_REPLIES_APPROVED_KEY, String(next)],
  );
  return next;
}

/** True while public-thread replies still wait (fewer than the limit approved). */
export function publicRepliesStillWait(db: Database): boolean {
  return approvedPublicReplies(db) < PUBLIC_THREAD_REPLY_LIMIT;
}

/** The bridge's `reply` card kind for the card engine (Approve only records the decision). */
export function publicReplyApprovalKind(opts: {
  db: Database;
  now?: () => number;
}): ApprovalKind<ApprovalRequest, void> {
  return storedApprovalKind({
    db: opts.db,
    kind: PUBLIC_REPLY_KIND,
    class: PUBLIC_REPLY_CLASS,
    audit: "public-reply",
    nothingDone: PUBLIC_REPLY_NOTHING_DONE,
    approvedOutcome: () => PUBLIC_REPLY_APPROVED,
    ...(opts.now ? { now: opts.now } : {}),
  });
}

/** What became of a post the gate saw. */
export type PublicReplyOutcome =
  | {
      post: true;
      /** True when it waited and the owner approved it. */
      held: boolean;
      /** What to post: as given, or exactly the text the approved card showed. */
      text: string;
      requestId?: string;
    }
  | {
      post: false;
      outcome: PublicReplyNo;
      requestId?: string;
      /** The hold note the gate posted (now the "Not posted — …" line), if any. */
      noteMessageId?: string;
    };

export type PublicReplyHoldInput = {
  /** Where the post goes (a thread id for a thread). */
  channelId: string;
  /** Exactly what would be posted. */
  text: string;
  /** Who the reply answers (a Discord user id), for the card and audit. */
  requester?: string;
  /** chat | ask | session | work | schedule. */
  surface: string;
  /** A stop (or the bridge closing) ends the wait: nothing is posted. */
  signal?: AbortSignal;
  /**
   * Show the hold line where the reply will go (the run's progress message);
   * true when it was shown. Otherwise, or when it returns false, the gate
   * posts a short note with the line, removed on Approve.
   */
  showHold?: (line: string) => Promise<boolean>;
  /** The note replies to this message. */
  replyToMessageId?: string;
};

export type PublicReplyGate = {
  /** The gateway's lookup at post time; a failed lookup is public (fail closed). */
  isPublicThread(channelId: string): Promise<boolean>;
  /** True when a post with model text in `channelId` must wait now. */
  mustHold(channelId: string): Promise<boolean>;
  /** Hold one post with model text until the owner's OK (or post it at once). */
  hold(input: PublicReplyHoldInput): Promise<PublicReplyOutcome>;
  /** End every wait (the bridge is stopping): nothing waiting is posted. */
  close(): void;
};

type NotePost = (o: {
  channelId: string;
  content: string;
  replyToMessageId?: string;
}) => Promise<{ messageId: string } | null>;
type NoteEdit = (o: {
  channelId: string;
  messageId: string;
  content?: string | null;
  components?: unknown[] | null;
}) => Promise<boolean>;
type NoteDelete = (o: { channelId: string; messageId: string }) => Promise<boolean>;

export type PublicReplyGateDeps = {
  /** The shared DB (count and cards); none ⇒ a post that must wait is not posted. */
  db?: Database;
  /** The configured owner, read now. */
  owner: () => OwnerRecord | null;
  /** The gateway's public-thread lookup, read now (none ⇒ nothing is public). */
  lookup?: () => ((channelId: string) => Promise<boolean>) | undefined;
  /** The gateway's post / edit / delete, read now, for the hold note. */
  post?: () => NotePost | undefined;
  edit?: () => NoteEdit | undefined;
  remove?: () => NoteDelete | undefined;
  /** Run a card delivery pass now, so the card goes out at once. */
  deliver?: () => void;
  ttlMs?: number;
  pollMs?: number;
  now?: () => number;
  /** Tests: called right after a card is recorded. */
  onRequest?: (req: ApprovalRequest) => void;
  log?: (line: string) => void;
};

function errText(e: unknown): string {
  return formatErrorLine(e, { max: 200 });
}

/** Test seams: a short card lifetime and poll, and a hook right after a card is recorded. */
export type PublicReplyTestHooks = {
  ttlMs?: number;
  pollMs?: number;
  onRequest?: (req: ApprovalRequest) => void;
};

let testHooks: PublicReplyTestHooks = {};

/** Tests only: set (or clear with `{}`) the gate's seams. Returns the previous ones. */
export function setPublicReplyTestHooks(hooks: PublicReplyTestHooks): PublicReplyTestHooks {
  const prev = testHooks;
  testHooks = hooks;
  return prev;
}

export function createPublicReplyGate(deps: PublicReplyGateDeps): PublicReplyGate {
  const closer = new AbortController();
  const log = deps.log ?? ((line: string) => console.log(line));

  const isPublicThread = async (channelId: string): Promise<boolean> => {
    const lookup = deps.lookup?.();
    if (!lookup) return false;
    try {
      return await lookup(channelId);
    } catch (e) {
      log(`[discord] AUTONOMY-10: could not tell whether ${channelId} is a public thread (${errText(e)}); treating it as one`);
      return true;
    }
  };

  const stillWaits = (): boolean => {
    if (!deps.db) return true;
    try {
      return publicRepliesStillWait(deps.db);
    } catch {
      return true;
    }
  };

  const mustHold = async (channelId: string): Promise<boolean> => {
    if (!channelId.trim()) return false;
    if (!stillWaits()) return false;
    return isPublicThread(channelId);
  };

  const postNote = async (input: PublicReplyHoldInput): Promise<string | undefined> => {
    const post = deps.post?.();
    if (!post) return undefined;
    try {
      const sent = await post({
        channelId: input.channelId,
        content: PUBLIC_REPLY_HOLD_LINE,
        ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
      });
      return sent?.messageId;
    } catch {
      return undefined;
    }
  };

  const settleNote = async (channelId: string, messageId: string | undefined, line: string | null) => {
    if (!messageId) return;
    try {
      if (line === null) {
        const remove = deps.remove?.();
        if (remove && (await remove({ channelId, messageId }))) return;
        // No delete: the note says the reply follows.
        await deps.edit?.()?.({ channelId, messageId, content: "✅ The owner OK'd this reply (below)." });
        return;
      }
      await deps.edit?.()?.({ channelId, messageId, content: line, components: null });
    } catch {
      /* best effort: the reply (or its absence) is what counts */
    }
  };

  const hold = async (input: PublicReplyHoldInput): Promise<PublicReplyOutcome> => {
    const asIs: PublicReplyOutcome = { post: true, held: false, text: input.text };
    if (!input.text.trim()) return asIs;
    if (!(await mustHold(input.channelId))) return asIs;
    const owner = deps.owner();
    if (!owner?.discordId?.trim()) return { post: false, outcome: "no-owner" };
    const db = deps.db;
    if (!db) return { post: false, outcome: "unavailable" };
    const signals = [closer.signal, ...(input.signal ? [input.signal] : [])];
    if (signals.some((s) => s.aborted)) return { post: false, outcome: "stopped" };
    const stop = new AbortController();
    const onAbort = () => stop.abort();
    for (const s of signals) s.addEventListener("abort", onAbort, { once: true });

    const store = new ApprovalStore({ db, ...(deps.now ? { now: deps.now } : {}) });
    let req: ApprovalRequest;
    try {
      let approved = 0;
      try {
        approved = approvedPublicReplies(db);
      } catch {
        approved = 0;
      }
      req = store.request({
        kind: PUBLIC_REPLY_KIND,
        class: PUBLIC_REPLY_CLASS,
        // ≤ APPROVAL_TITLE_MAX (100): a card that does not fit is never sent.
        title: `Public-thread reply (AUTONOMY-10) · ${approved}/${PUBLIC_THREAD_REPLY_LIMIT} approved · from ${input.surface}`,
        action: `post this reply in a public thread (its first ${PUBLIC_THREAD_REPLY_LIMIT} public-thread replies wait for your OK, AUTONOMY-10.a)`,
        target: `Discord thread <#${input.channelId}> (${input.channelId})`,
        amount: `1 reply (${input.text.length} characters)`,
        text: input.text,
        textLabel: "text",
        ...(input.requester?.trim() ? { requester: input.requester.trim() } : {}),
        waiter: scheduleRunnerId(),
        ttlMs: testHooks.ttlMs ?? deps.ttlMs ?? PUBLIC_REPLY_CARD_TTL_MS,
      });
    } catch (e) {
      for (const s of signals) s.removeEventListener("abort", onAbort);
      log(`[discord] AUTONOMY-10: the Approve card for a reply in ${input.channelId} could not be raised (${errText(e)}); nothing was posted`);
      return { post: false, outcome: "unavailable" };
    }
    log(
      `[discord] AUTONOMY-10: a reply in public thread ${input.channelId} (${input.surface}) waits for the owner's OK (request ${req.id})`,
    );
    deps.onRequest?.(req);
    testHooks.onRequest?.(req);
    deps.deliver?.();

    let shown = false;
    if (input.showHold) {
      try {
        shown = await input.showHold(PUBLIC_REPLY_HOLD_LINE);
      } catch {
        shown = false;
      }
    }
    const noteId = shown ? undefined : await postNote(input);

    let decided: ApprovalRequest | undefined;
    try {
      decided = await store.waitForDecision(req.id, {
        pollMs: testHooks.pollMs ?? deps.pollMs ?? PUBLIC_REPLY_POLL_MS,
        signal: stop.signal,
      });
    } catch (e) {
      log(`[discord] AUTONOMY-10: request ${req.id} could not be read (${errText(e)}); nothing was posted`);
      decided = undefined;
    } finally {
      for (const s of signals) s.removeEventListener("abort", onAbort);
    }

    if (decided?.status === "approved" && !stop.signal.aborted) {
      let used = false;
      try {
        used = db
          .transaction(() => {
            if (!store.consume(req.id)) return false;
            countApprovedPublicReply(db);
            return true;
          })
          .immediate();
      } catch (e) {
        log(`[discord] AUTONOMY-10: approval ${req.id} could not be used (${errText(e)}); nothing was posted`);
      }
      if (used) {
        await settleNote(input.channelId, noteId, null);
        log(`[discord] AUTONOMY-10: the owner approved request ${req.id}; posting the reply`);
        // Exactly the text the card showed (stored SAFE-6 scrubbed).
        return { post: true, held: true, text: decided.text ?? scrubSecrets(input.text), requestId: req.id };
      }
    }
    const outcome: PublicReplyNo =
      decided?.status === "denied"
        ? "denied"
        : stop.signal.aborted
          ? "stopped"
          : decided === undefined
            ? "unavailable"
            : "expired";
    log(`[discord] AUTONOMY-10: request ${req.id} ${outcome}; the reply was not posted (SAFE-20)`);
    await settleNote(input.channelId, noteId, publicReplyNotPostedText(outcome));
    return { post: false, outcome, requestId: req.id, ...(noteId ? { noteMessageId: noteId } : {}) };
  };

  return {
    isPublicThread,
    mustHold,
    hold,
    close() {
      closer.abort();
    },
  };
}
