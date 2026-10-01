---
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
artifact: research
---

# Research

- Sources: issue #97 (body; Leif's 2026-09-26 comment: the first 20 public
  thread replies approved one by one, then automatic; the 2026-09-30 rollup
  naming this as the missing half), `hi/autonomy.md`, Leif's interview record
  (round 13: "always ask — every channel post it makes and each of its first
  20 public-thread replies waits for the card, even dictated text and
  replies to the owner"), the conservative defaults file (fixed-text system
  posts are not gated; a schedule's own posts are not announcements), and
  the build brief for this slice.
- Discord: forum and media channel posts are `PUBLIC_THREAD` (11) channels;
  announcement threads are `ANNOUNCEMENT_THREAD` (10); private threads are
  12. The inbound handler only treats Public / Private threads as threads,
  so the post-time lookup is what covers announcement threads.
- Every model-text post goes through one of: `thinking.finalizeContent` /
  `postAnswerParts` (chat, ask pick), `replyRef.fn` (thin-ack restatement),
  `finishSlashWithOwnerNotice` (`/session start`, `/work`) and the
  scheduler's `outbound.post` (result, ask). `progressFromFrame` never shows
  model text in the progress embed (only the must-ask wait line), and
  `formatAskReply` posts no question or context for a spend-cap stop.
- The #316 engine's `storedApprovalKind` already DMs a request's text first,
  scrubbed and split fence-safe, and closes a request whose waiter process
  is gone; `ApprovalStore.waitForDecision` / `consume` give the waiting side.
  `APPROVAL_TITLE_MAX` is 100: a longer title is never sent (found while
  testing; the card title is kept short).
