---
change: collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the
artifact: design
---

# Design

- `ask-ping.ts`: `formatCollapsedPing({ mentionUserIds, questionUserIds,
  alreadyPinged })` → `{ content, mentionUserIds } | null`. Ids are trimmed,
  deduped, `alreadyPinged` removed; ids in `questionUserIds` get
  `COLLAPSED_PING_QUESTION` ("↑ question for you"), the rest
  `COLLAPSED_PING_NEEDS` ("↑ needs you"); groups joined with " · " on one
  line. Content is built only from ids and constants (no model text), so it
  needs no scrub or defang.
- `spend-post.ts`: `ChannelPost` gains optional `replyToMessageId` (the
  gateway reply already takes it). `postCollapsedPing({ post, channelId,
  replyToMessageId, mentionUserIds, questionUserIds, alreadyPinged })` formats
  and sends with `mentionUserIds` = exactly the pinged ids (the gateway maps
  that to `allowedMentions { parse: [], users }`); returns null when there is
  no post function, nobody to ping, the post returns null or throws.
- Bridge chat + button pick: right after `finalizeContent` succeeds, call it
  with the answer's `out.mentionUserIds` (ask mention + warning owner), the
  clarify requester as `questionUserIds`, replying to the collapsed message
  id; track the ping message id on the session. The fallback branch is
  untouched (its reply is fresh). Claims (`spend.release` / `askOwner.release`)
  keep their meaning: the answer went out, so a failed ping does not hand them
  back (same as #160's appended notice).
- `finishSlashWithOwnerNotice`: record the body's delivery mode via
  `onDelivered` (chained to the caller's). After a collapsed body: with no
  notice, ping `opts.mentionUserIds` (in a finally, so a throwing
  `deleteReply` still pings, then re-throws); with a notice and a post
  function, ping the collapsed answer's mentions (the body's, or body + owner
  when the notice had to be appended by re-editing) minus
  `notice.mentionUserIds` when the notice post went out. Reply target is
  `thinking.progressMessageId`; the ping is tracked via `trackBotMessage`.
  Without a post function nothing fresh can be sent (unchanged).
- Rejected: pinging by replying to the request message (the gateway's
  `repliedUser: true` would also ping the requester on an owner-only ping);
  moving mentions out of the collapsed answer (keeps ASK-6/7 text intact).
