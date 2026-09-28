---
id: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
state: archived
type: bug_fix
base_commit: aef2cde685e9e9be6f0dc1c4311a916e33981afc
---

# Bridge marks a reply interrupted after a restart: in-flight replies are recorded in the shared DB and the next bridge start edits the frozen progress embed to a failed interrupted status (or replies to the request message) instead of leaving it at working forever

## Intent

Bridge marks a reply interrupted after a restart: in-flight replies are recorded in the shared DB and the next bridge start edits the frozen progress embed to a failed interrupted status (or replies to the request message) instead of leaving it at working forever

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- While the bridge works on a reply to a message it keeps one discord_inflight_replies row (session id, channel id, progress embed id once sent, request message id, start time) and deletes it on every exit path (done, failed exit, ask, worktree refused, thrown error); refused/ignored messages never record a row. On the next bridge start each leftover row is handled once, sequentially and best effort: the bot's own progress embed is edited to the red failed status 'interrupted: Corvidinho restarted before this reply finished — please send it again'; if there is no embed id or the edit fails, the bot replies to the request message with the same text in the same channel; the row is then deleted either way and startup never throws. With no leftover rows nothing is posted or edited. Schema v9 adds the table; a v8 DB migrates and keeps its rows. No new slash command or env var.

## No-spec Rationale

Not applicable
