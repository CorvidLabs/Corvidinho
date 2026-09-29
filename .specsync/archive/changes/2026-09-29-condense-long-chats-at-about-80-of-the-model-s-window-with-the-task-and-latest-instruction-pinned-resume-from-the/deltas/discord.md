---
module: discord
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
---

# Delta — discord (condensed conversations, kept and resumed: SESSION-5/6, SESSION-3.a, AGENT-6.a)

## Added

### REQUIREMENT REQ-discord-472

Long Discord conversations SHALL be condensed, kept and resumed
(SESSION-5, SESSION-6, SESSION-3.a, AGENT-6.a; issue #72).

Condensing (SESSION-5). Before each run on a session,
`SessionStore.threadPrompt(session, prompt)` SHALL measure the prompt the
bridge sends for the conversation — the replay block (REQ-discord-072) plus
a blank line plus the new message and any pending-ask block — in characters.
When it reaches 80% of the model's context window (tokens × 4 chars, the
chars/4 estimate of PLUGIN-6) it SHALL fold the oldest turns into the
session's summary, one at a time, until the prompt is under that budget. The
window SHALL be `CORVIDINHO_LLM_CONTEXT_TOKENS` when it is a positive integer
(raised to 1024), else 8192 tokens (`CONTEXT_WINDOW_DEFAULT_TOKENS`); the
budget SHALL never pass 32000 characters (`CONVERSATION_PROMPT_MAX_CHARS`),
because the prompt reaches the agent as one process argument. The session's
opening human turn (the current task) and its newest human turn (its latest
instruction) SHALL never be folded, and the new message SHALL never be
touched, so all three reach the model word for word (secret-scrubbed,
SAFE-6; in the replay a line that opens like a Corvidinho block or a turn
label is marked `(quoted)`, SAFE-12). A folded turn SHALL become one summary point
`- Human: …` / `- You (Corvidinho): …` holding its own opening words
(at most 160 characters); no model call. The summary SHALL stay within a
third of the budget (500–6000 characters): past it older points are
shortened to 80 characters and then left out, a first line
`(N earlier points left out)` counting them; when only the pinned turns
are left and the prompt is still over, the summary gives way, never the
pinned words. In the block the opening human turn comes first, then the
label `Condensed summary of earlier turns (…)` and the points, then the
kept turns; the block keeps its `[Corvidinho …]` header and no blank line.
Condensed text stays data (SAFE-12, REQ-discord-071): replayed turns and
summary points SHALL have invisible characters stripped and lines that open
like a Corvidinho block or a turn label marked `(quoted)`; words a turn held
inside an untrusted-data fence (`fenceUntrustedData`, e.g. a WATCH issue or
comment body) SHALL stay inside that fence's own open and end markers in its
summary point (the markers do not count against the 160 characters) and in
a clipped turn (its end marker put back), and a summary point holding a fence
SHALL be left out whole rather than shortened inside it.

Stored with the session (SESSION-6). A fold SHALL store the summary with
the session — in its `conversation_threads` record (schema v13), scrubbed —
and rewrite the session's `discord_session_turns` rows to the kept turns.
After a bridge restart the live session SHALL load its summary, so its
next prompt picks up from the summary instead of the folded turns; a run with
a smaller window (another model) SHALL condense further from that summary
to 80% of its own window.

Kept 30 days per thread (AGENT-6.a). When a session idles past the soft
TTL (also one found expired when the store loads after a restart) or ends,
and it has turns or a summary, its conversation SHALL be kept in
`conversation_threads`: surface `discord`, thread key `thread:<thread id>`
(a session in a Discord thread) or `channel:<channel id>`, the session's
user, the session id, the session's project directory, the summary, its
turns bounded to the last 20 (`CONVERSATION_KEEP_TURNS`; the opening human
turn kept, the rest folded into the summary) and its answer message ids (the
newest 100), all text scrubbed (SAFE-6; `summary` and the JSON `turns` are
`SCRUB_TARGETS`). A record SHALL be purged 30 days
(`CONVERSATION_RETENTION_MS`) after its last update; a session kept when it
ends or idles out counts from its last activity, not from when its idle-out
is noticed (a lookup or a restart may notice it late), and a record already
past its 30 days is purged at once. Every read and write purges first (so
nothing older is ever served), the store purges on open, and a running
bridge purges every hour (`CONVERSATION_PURGE_INTERVAL_MS`).

Resumed after the TTL (SESSION-3.a). A message that reaches the router
after its session expired SHALL start a new session from the retained
conversation, instead of getting no answer, when it is the conversation
user's own reply to one of the conversation's answers
(`retainedForReply`), or their message — mention or not — in the Discord
thread the conversation was held in (`retainedForThread`); the message must
be where the conversation was held (the same thread, or the same channel
outside threads). The channel allowlist gate (REQ-discord-212), the actor
gate (REQ-discord-201, deny lists win) and the mute / rate limit gate
(DISCORD-6) SHALL run first, exactly as for a continue. The new session
(`resumeFromRetained`: new id, `start_session`, `resume: false`, its own
worktree) SHALL begin with the retained summary and turns as stored when
the message arrives (the record is read again: a session that carried it
and idled out, noticed on that lookup, keeps its newer turns there first) and
carry the same record, so its own end updates it; a record gone by then
(purged or forgotten) resumes nothing. When a live session already carries
the record (resumed earlier), the message SHALL continue that session
instead. The new session SHALL work in the conversation's project
(SESSION-WORKTREE-4): the project is re-checked when its worktree is bound,
and when it no longer resolves the bind fails as for any talk, never
falling back to the default project. Another user's reply or thread message SHALL never get the
conversation; a new @mention elsewhere in the channel starts with nothing
replayed (SESSION-1/3).

Forget (AGENT-6.a / MEMORY-ACL-6). `SessionStore.forgetConversations(userId)`
SHALL clear that Discord user's live sessions' turns and summaries (the
sessions stay open) and delete every retained record that is theirs, and
`forgetConversations(db, { discordUserIds, githubLogins })`
(`src/store/conversation.ts`) SHALL delete every record of the person or
holding their words (WATCH participants, REQ-watch-472). An approved
forget-me (MEMORY-ACL-6, REQ-discord-101) SHALL delete, in the approval's
transaction (`forgetMemoryTargets`), every retained record of the person —
by their Discord ids and a declared person's linked GitHub logins, as its
person or a participant — and count them on the owner's card when any went
(the card names their kept conversations among what Approve deletes); the
running bridge's `SessionStore.forgetTurnsOfUsers` SHALL also drop their live
sessions' summaries and retained records, so nothing of theirs is replayed or
kept again. No slash command or chat path is added here.

Schema v13 (`SCHEMA_VERSION` 13) SHALL add `conversation_threads` by a
forward-only migration after v12 (`forget_requests`, REQ-discord-101)
(`id`, `surface`, `thread_key`, `user_id`, `session_id`, `project`,
`summary`, `turns`, `participants`, `bot_message_ids`, `updated_at`; indexes
on thread, session and `updated_at`), keeping every existing row (a DB at v12
keeps its forget requests); re-running it changes nothing.

Acceptance Criteria
- `CORVIDINHO_LLM_CONTEXT_TOKENS` sets the window (unset or not a positive integer → 8192; below 1024 → 1024); the condense budget is `floor(window × 0.8) × 4` characters, never past 32000.
- A prompt under the budget replays every turn with no summary; at the budget the oldest turns fold into `- Human:` / `- You (Corvidinho):` points until the prompt is under it, the opening request, the newest human turn and the new message word for word; with nothing left to fold the pinned turns stay and the summary gives way.
- The summary is stored with the session (`conversation_threads.summary`, scrubbed) and the turn rows are the kept turns; after a restart the next prompt is the same (summary, no folded turn); with a smaller window it condenses further from that summary to 80% of that window.
- Past 200 turns the oldest turn after the opening request is folded into the summary.
- After the soft TTL, the user's reply to the session's answer starts a new session (new id, `resume: false`, `humanText` the new message) whose prompt holds the earlier request and answer (and the summary when there was one); a second reply to the old answer continues that new session; a plain message in its thread does the same without a mention.
- Another user's reply to my expired answer, or message in my thread, never gets my conversation; a deny-listed or muted user, or a message from a channel that is not allowlisted, gets no run.
- A session that idled out while the bridge was down resumes by reply after the restart.
- A reply to an older answer after the resumed session idled out (nothing looked it up since) starts a new session from the resumed session's newest turns, not the older ones, and the one record keeps them.
- A `/session start`-style talk on an explicit project resumes in that project (the bind works there); once the project is gone the resumed session's bind fails rather than working in the default project.
- 30 days after its last update the record is purged and the reply gets no answer; a session nothing looked up for 30 days after its last activity keeps nothing; a session with nothing said keeps nothing.
- `forgetConversations` deletes the person's retained records (Discord ids, GitHub logins case-insensitive, participants) and clears their live threads, never another person's; a later reply gets no answer.
- A v12 DB migrates to v13 keeping its rows and its forget requests, and a v11 DB goes through v12 to v13; `rescrubDatabase` re-scrubs `conversation_threads.summary` and `turns`.
- An approved forget-me deletes the person's retained records (Discord ids, a declared person's GitHub logins, threads they commented on) with their memory, nobody else's; the running bridge's `forgetTurnsOfUsers` drops their live summary and records, and their next prompt replays nothing.
- A fenced turn folded into a summary point keeps its words between that fence's own markers; a summary over its cap leaves a fenced point out whole; replayed turns and summary points quote fake block lines and turn labels, and a turn clipped inside its fence gets its end marker back.

## Modified

### REQUIREMENT REQ-discord-019

Discord `SessionStore` (and `WorkStore`) SHALL optionally persist to a local
SQLite database under the shared Corvidinho data directory
(`~/.local/share/corvidinho/` by default, overridable via `CORVIDINHO_DATA_DIR`)
so session and work stubs survive process restarts (SESSION durable substrate).
Cross-session continuity SHALL use the same shared SQLite file via MEMORY
tables (REQ-discord-021), not a long-lived ProcessManager.

Soft TTL SHALL default to about **45 minutes** (within SESSION-2's 30–60 minute
band), overridable via `CORVIDINHO_SESSION_TTL_MS` clamped to that band.
Continued activity (`touch` / continue paths) SHALL refresh `lastActivityAt`
(SESSION-2). Lookups for sessions idle past the TTL SHALL treat them as expired
and SHALL NOT continue them, so the next eligible mention starts a fresh
session (SESSION-1 / SESSION-3). The expired session's conversation is kept
apart for 30 days (REQ-discord-472): its user's reply to one of its answers,
or their message in its thread, starts a new session that begins from it
(SESSION-3.a); a new @mention elsewhere in the channel still starts with
nothing replayed.

The bridge SHALL open the shared DB when starting (unless tests inject
in-memory stores). Schedules and memories MAY share the same SQLite file
(REQ-discord-020 / REQ-discord-021). Fixture tests SHALL cover persist/reload
and TTL expiry without a live Discord token.

Acceptance Criteria
- Session create + bot-message/thread maps reload from SQLite after reopen.
- Work task stubs reload from the same DB after reopen.
- Default TTL ~45m; env override clamped to 30–60m.
- Idle past TTL → getByThread/getByBotMessage/get/list omit or purge; continue path does not resume.
- A reply to an expired session's answer by its user starts a new session (new id, `resume: false`) from its retained conversation (REQ-discord-472); a new @mention in the channel starts one with nothing replayed.
- Activity within TTL keeps continue_session.
- Data dir defaults to `~/.local/share/corvidinho/`; `CORVIDINHO_DATA_DIR` overrides.
- Memories share `corvidinho.db` (schema v3) without a second database.
- No ProcessManager; secrets out of repo; existing allowlists unchanged.
- Fixture tests pass without live Discord token.

Session durable store SHALL additionally persist optional worktree fields
(`project`, `worktree_path`, `worktree_branch`, `worktree_state`) on schema **v4**
without breaking soft TTL behavior (SESSION-WORKTREE / REQ-discord-022). Soft TTL
purge SHALL park or remove the session worktree before dropping the row
(SESSION-WORKTREE-3).

Acceptance Criteria (worktree addendum)
- Schema v4 migration adds worktree columns; reload restores worktree binding.
- Soft TTL purge parks/removes worktree then drops session row.
- Prior TTL fixtures still green.

### REQUIREMENT REQ-discord-072

A Discord session SHALL keep its thread (AGENT-6, with DISCORD-2 /
DISCORD-2.a "so the conversation stays coherent"), condensed as the
conversation grows (SESSION-5/6, REQ-discord-472). Every agent run on a
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
channel, or a button pick that resumes it), or starts one from a retained
conversation (REQ-discord-472), the bridge SHALL put the session's condensed
summary (when any) and earlier turns, oldest first, in one labelled block
(`SESSION_THREAD_HEADER` … `SESSION_THREAD_FOOTER`, turns labelled
`Human:` / `You (Corvidinho):`) ahead of the new message and any
pending-ask block, before identity and memory are added
(`SessionStore.threadPrompt`). The block's size SHALL follow the model's
window: at about 80% of it the oldest turns are condensed into the summary
(REQ-discord-472). An agent turn SHALL be clipped to
`SESSION_THREAD_TURN_MAX_CHARS` (1500) and a human turn to
`SESSION_THREAD_HUMAN_TURN_MAX_CHARS` (8000: a whole Discord message or
6000-char slash option, and a whole WATCH event prompt). As a transport safety net, a block still over
`SESSION_THREAD_BUDGET_CHARS` (32000) SHALL keep the session's opening
request and as many of the newest turns as fit, and the turns between SHALL
be replaced by one `(N earlier turns omitted)` marker. The
block SHALL open with a `[Corvidinho …]` header and hold no blank line
(blank lines inside a turn are collapsed), so Planning module selection
leaves the whole block out and earlier turns or the header never pick a
module the new message does not name (REQ-agent-004). A clipped turn SHALL
never end on half a surrogate pair. The condensing is extractive (each
folded turn becomes one short point of its own words); no model call. A
session keeps at most `SESSION_THREAD_MAX_TURNS` (200) turns: past it the
oldest turn after the opening request is folded into the summary.

Turns SHALL persist in the shared SQLite DB in the module-owned
`discord_session_turns` table (CREATE TABLE IF NOT EXISTS when a
`SessionStore` opens the DB, no schema version bump; rows cascade with
their session) so the thread survives a bridge restart within the soft TTL
(REQ-discord-019). Live turns SHALL live only as long as their session:
ending a session, or its idle expiry past the soft TTL, SHALL delete its
turn rows after its conversation (summary, last turns, answer ids) is kept
in `conversation_threads` for 30 days (REQ-discord-472), and a session
that starts fresh (a new @mention) SHALL get no replay (SESSION-2/3;
longer-term facts come from MEMORY, SESSION-4). A session belongs to one Discord
user (SESSION-MULTI-1), so no other user's run SHALL ever see its turns.
Turn text SHALL be passed through `scrubSecrets` before it is kept or
replayed, and `discord_session_turns.content` SHALL be listed in
`SCRUB_TARGETS` (SAFE-6). The run's `humanText` (the only source of SAFE-4
confirm tokens) SHALL stay the current message only. No new config key, CLI
flag or slash command; the one optional env var is the model's window
(`CORVIDINHO_LLM_CONTEXT_TOKENS`, REQ-discord-472). CLI `task run` is
unchanged; WATCH keeps its own thread conversation (REQ-watch-472).

Acceptance Criteria
- A reply to the bot's answer continues the session with `resume: true`, and its prompt holds the earlier request and answer, oldest first, before the new message; `humanText` is the new message only.
- The same user's @mention that continues their live session in the channel, and each further reply, carries every earlier turn in order.
- After a bridge restart on the same DB file within the soft TTL, a reply to the earlier answer continues the session and its prompt holds the earlier request and answer.
- A reply to a `/session start` or `/work` answer carries that topic or description and its answer.
- The human's request is in the DB while its run is still going (a bridge restarted mid-run finds it), and a run that throws (chat, `/session start`, `/work`) keeps the request and the failure line, so the next message, or a reply to the failure, carries them.
- `planningSelectionText` of a continued run's prompt is the new message only: the block's header and earlier turns (multi-paragraph answers included) pick no module, and a module the new message names still counts; a turn clipped next to an emoji never ends on half a surrogate pair.
- A button pick's resumed run carries the original request (not only the question and the label); a later reply carries the request, the question, the picked label and the answer.
- A spend-cap stop keeps the human's request in the thread; the next prompt holds no spend-cap text and no pending-ask block.
- A thread past the 32000-char block ceiling renders within it: the opening request right after the header, one marker whose count is exactly the turns left out, then the newest turns ending with the newest answer; one huge agent turn is clipped at 1500, a 4000-char human turn is kept whole and one past 8000 is clipped.
- A new @mention after the soft TTL starts a new session whose prompt holds no earlier turn; ending or expiring a session deletes its live turn rows (memory and DB); orphan rows left by an older build are swept on load.
- Past 200 turns the oldest turn after the opening request is folded into the session's summary (stored with the session), not lost.
- Another user's session in the same channel (by @mention or by replying with the ping to my answer) never sees my turns, and my continuation never sees theirs.
- Stored turns hold `[redacted:github-token]` instead of a `ghp_` token (in memory, in the DB, and in the replayed prompt); `rescrubDatabase` rewrites a raw row in `discord_session_turns`.
- The turns table is created on `SessionStore` open without changing `schema_meta.version`, idempotently.
