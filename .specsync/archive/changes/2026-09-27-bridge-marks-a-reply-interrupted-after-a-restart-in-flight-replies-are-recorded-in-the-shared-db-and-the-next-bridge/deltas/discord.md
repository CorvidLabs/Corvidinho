---
module: discord
change: bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge
---

# Delta — discord (interrupted replies after a bridge restart)

## Added

### REQUIREMENT REQ-discord-311

While the bridge works on a reply to a Discord message, or on the run a
button pick (DISCORD-ASK) resumes, it SHALL keep one
`discord_inflight_replies` row (schema v9: id, session id, channel id, the
allowlisted parent channel id when the reply is in a thread, progress embed id
once sent, request message id, start time; no message text) from before the
progress embed is sent until the reply finishes, and SHALL delete it on every
exit path (done, failed exit, ask, worktree refused, thrown error). On start,
the bridge SHALL read the rows left by an earlier process before any new reply
begins and, once the gateway is up, handle each one sequentially and best
effort: when neither the row's channel nor its parent channel is allowlisted
any more (DISCORD-5), post and edit nothing; otherwise edit the bot's own
progress embed to the red failed status `interrupted: Corvidinho restarted
before this reply finished — please send it again`, and when there is no embed
id or the edit fails, reply to the recorded request message in the same
channel with the same text; then delete the row. Recovery SHALL NOT throw out
of bridge start and SHALL NOT touch any other channel or message. No slash
command or env var is added.

Acceptance Criteria
- A running reply has exactly one row whose progress id is the sent embed; the row is gone after success, failed exit, ask, thrown error and worktree refusal; ignored or refused messages never add one.
- A reply in a thread records the thread as its channel and the allowlisted parent channel; a button pick's resumed run records a row (request id = the ask stub message) and clears it after.
- A bridge that died mid-reply leaves the row; the next start edits that embed (same channel, same message id) to the error color with the interrupted text, sends no new message, and deletes the row.
- A failed edit, or a row with no embed id, falls back to a reply to the request message with the interrupted text; the row is deleted.
- A row whose channel and parent channel are no longer allowlisted gets no edit and no reply; the row is deleted.
- Edit and reply both failing still lets the bridge start; the row is deleted.
- With no rows, bridge start sends, edits and replies nothing.
- A fresh DB is schema 9 with the table; a v8 DB migrates to 9 and keeps its rows.
