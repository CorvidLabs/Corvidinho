---
change: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
artifact: design
---

# Design

- `src/discord/slash-finish.ts` — `finishSlashWithThinking` gains three
  optional fields; without them it behaves exactly as #208 wrote it:
  - `askStatus` `{ status, failed }`: the fallback status for a run that
    stopped to ask (`failed` for stuck), so it never shows "✅ Done".
  - `mentionUserIds`: the collapsed answer's allowed mentions (the clarify
    requester; empty for stuck / spend-cap, whose owner ping is the notice).
  - `onDelivered(mode)`: called once the answer is out (collapsed edit or
    fallback reply), before the deferred reply is resolved, so a caller knows
    the answer went out even when `deleteReply` / `editReply` then throws.
- `src/discord/spend-post.ts` — `finishSlashWithOwnerNotice` replaces
  `replyWithOwnerNotice`: no notice ⇒ plain `finishSlashWithThinking`; no
  post function ⇒ the notice rides the answer (collapsed or reply); else the
  answer goes out, then the notice as a fresh post (owner-only mentions); if
  that post fails it is appended to the answer that went out (the collapsed
  message is edited again — `finalizeContent` edits a closed status that
  still has its message id — or the reply re-edited); when nothing carried
  it, `notice.release()` hands the warning and the cap ping back; the
  answer's error is re-thrown after the notice step.
- `/work` and `/session start` drop their early `thinking.done/fail` and
  pass `askStatus` + `mentionUserIds` from `formatAskReply`, the
  `slashOwnerNotice` and `ctx.post` to `finishSlashWithOwnerNotice`.
