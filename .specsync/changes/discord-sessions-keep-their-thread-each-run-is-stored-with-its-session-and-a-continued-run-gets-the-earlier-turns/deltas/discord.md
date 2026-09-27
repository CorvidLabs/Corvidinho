---
module: discord
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
---

# Delta — discord (a Discord session keeps its thread, AGENT-6)

## Added

### REQUIREMENT REQ-discord-072

A Discord session SHALL keep its thread (AGENT-6, with DISCORD-2 /
DISCORD-2.a "so the conversation stays coherent"). Every agent run on a
session SHALL be recorded with that session as two turns: the human's own
words for that run (the routed message text before memory, identity and
image enrichment; the picked option's label for a button pick; the topic of
`/session start`; the description of `/work`), recorded as the run starts so
a run that throws or a bridge that dies mid-run still keeps the request, and
the answer the bridge posted (the summary, the ask text, or the failure line,
also when the run throws). A button ask, whose Choose stub does not show the
question, SHALL be recorded as its question and choices. A SAFE-8 spend-cap
stop SHALL record no answer turn, so no cap text reaches a later prompt
(REQ-discord-098).

When a run continues a live session (a reply to a tracked bot message, a
message in the session's thread, the same user's @mention in the same
channel, or a button pick that resumes it), the bridge SHALL put the
session's earlier turns, oldest first, in one labelled block
(`SESSION_THREAD_HEADER` … `SESSION_THREAD_FOOTER`, turns labelled
`Human:` / `You (Corvidinho):`) ahead of the new message and any
pending-ask block, before identity and memory are added. The block SHALL fit
a fixed character budget (`SESSION_THREAD_BUDGET_CHARS`, 6000; each turn
clipped to `SESSION_THREAD_TURN_MAX_CHARS`, 1500): the session's opening
request and as many of the newest turns as fit SHALL be kept, and the turns
between SHALL be replaced by one `(N earlier turns omitted)` marker. The
block SHALL open with a `[Corvidinho …]` header and hold no blank line
(blank lines inside a turn are collapsed), so Planning module selection
leaves the whole block out and earlier turns or the header never pick a
module the new message does not name (REQ-agent-004). A clipped turn SHALL
never end on half a surrogate pair. No model summarising. A session keeps at most `SESSION_THREAD_MAX_TURNS`
(200) turns: past it the oldest turn after the opening request is dropped.

Turns SHALL persist in the shared SQLite DB in the module-owned
`discord_session_turns` table (CREATE TABLE IF NOT EXISTS when a
`SessionStore` opens the DB, no schema version bump; rows cascade with
their session) so the thread survives a bridge restart within the soft TTL
(REQ-discord-019). Turns SHALL live only as long as their session: ending a
session, or its idle expiry past the soft TTL, SHALL delete its turns, and a
session that starts fresh SHALL get no replay (SESSION-2/3; longer-term
continuity comes from MEMORY, SESSION-4). A session belongs to one Discord
user (SESSION-MULTI-1), so no other user's run SHALL ever see its turns.
Turn text SHALL be passed through `scrubSecrets` before it is kept or
replayed, and `discord_session_turns.content` SHALL be listed in
`SCRUB_TARGETS` (SAFE-6). The run's `humanText` (the only source of SAFE-4
confirm tokens) SHALL stay the current message only. No new env var, config
key, CLI flag or slash command; WATCH and CLI `task run` are unchanged.

Acceptance Criteria
- A reply to the bot's answer continues the session with `resume: true`, and its prompt holds the earlier request and answer, oldest first, before the new message; `humanText` is the new message only.
- The same user's @mention that continues their live session in the channel, and each further reply, carries every earlier turn in order.
- After a bridge restart on the same DB file within the soft TTL, a reply to the earlier answer continues the session and its prompt holds the earlier request and answer.
- A reply to a `/session start` or `/work` answer carries that topic or description and its answer.
- The human's request is in the DB while its run is still going (a bridge restarted mid-run finds it), and a run that throws (chat, `/session start`, `/work`) keeps the request and the failure line, so the next message, or a reply to the failure, carries them.
- `planningSelectionText` of a continued run's prompt is the new message only: the block's header and earlier turns (multi-paragraph answers included) pick no module, and a module the new message names still counts; a turn clipped next to an emoji never ends on half a surrogate pair.
- A button pick's resumed run carries the original request (not only the question and the label); a later reply carries the request, the question, the picked label and the answer.
- A spend-cap stop keeps the human's request in the thread; the next prompt holds no spend-cap text and no pending-ask block.
- A long thread renders within the budget: the opening request right after the header, one marker whose count is exactly the turns left out, then the newest turns ending with the newest answer; one huge turn is clipped.
- A session idle past the soft TTL starts a new session whose prompt holds no earlier turn; ending or expiring a session deletes its turns (memory and DB); orphan rows left by an older build are swept on load.
- Another user's session in the same channel (by @mention or by replying with the ping to my answer) never sees my turns, and my continuation never sees theirs.
- Stored turns hold `[redacted:github-token]` instead of a `ghp_` token (in memory, in the DB, and in the replayed prompt); `rescrubDatabase` rewrites a raw row in `discord_session_turns`.
- The turns table is created on `SessionStore` open without changing `schema_meta.version`, idempotently.
