---
module: watch
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
---

# Delta — watch (issue / PR thread conversation replayed into follow-ups: AGENT-6.a, SESSION-5)

## Added

### REQUIREMENT REQ-watch-472

WATCH follow-ups SHALL pick up the issue or PR thread's summary (AGENT-6.a,
with SESSION-5; issue #72). With a database, `startWatchPoller` SHALL keep
one retained conversation per issue or PR in the shared
`conversation_threads` table (schema v12, REQ-discord-472): surface
`watch`, thread key `issue:<owner/repo lowercased>#<number>`, the thread's
first sender (lowercased GitHub login) as its person, and every sender whose
event ran as a participant (`github:<login>`).

After each run on an issue or PR (whether it succeeded, failed or threw),
the event's prompt (as a human turn) and the run's summary (as an agent
turn) SHALL be added to that thread's conversation, scrubbed (SAFE-6), its
turns bounded to the last 20 with the opening human turn kept and the rest
folded into the summary. A DB failure SHALL be logged and SHALL NOT stop
the run, the ack or the run-summary comment.

Before a run on an issue or PR that has a retained conversation — a
continued session or a new one after the session's soft TTL — the poller
SHALL put the conversation (its summary and kept turns, oldest first) in
one block opened by `WATCH_THREAD_HEADER`
(`[Corvidinho earlier conversation on this GitHub issue or PR — …]`) and
closed by `[End of earlier conversation]`, ahead of the new event's prompt,
with no blank line inside, so Planning module selection leaves it out
(REQ-agent-004). At about 80% of the model's window
(`CORVIDINHO_LLM_CONTEXT_TOKENS`, same budget as REQ-discord-472) the
oldest turns SHALL be folded into the summary, the thread's opening request
and its newest request kept word for word. Another issue or PR never gets
it. A record SHALL be purged 30 days after its last update (every read and
write purges first, and every poll cycle purges), and forgetting a person
(`forgetConversations(db, { githubLogins })`, case-insensitive) SHALL delete
every thread they started or commented on. No GitHub-visible surface, env
var beyond the window, config key or CLI flag is added.

Acceptance Criteria
- A follow-up on the same issue gets the earlier event and answer replayed, oldest first, ahead of the new event; the first event and another issue get no block; `planningSelectionText` leaves the block out.
- Two hours later (past the session's TTL) the follow-up still gets it; 30 days after the last update it is purged and the next event gets no block.
- With a 1024-token window a long thread's prompt stays under the budget with the summary, the opening request and the latest request word for word.
- The stored turns hold `[redacted:github-token]`, never the token; participants are the lowercased senders; forgetting a login that only commented deletes the thread.

## Modified

### REQUIREMENT REQ-watch-037

WATCH sessions keyed by `owner/repo#number` SHALL persist in the shared
SQLite DB (`watch_sessions`) when the SessionStore is given a database, and
SHALL reload on restart so a follow-up on the same issue continues the same
session. The same soft TTL as Discord sessions (`resolveSessionTtlMs`,
SESSION-1..3) SHALL apply: activity within the TTL keeps the session; a
session idle past the TTL is dropped (memory and DB) and the next event on
that issue starts a fresh session; expired rows are dropped on load. At most
one session exists per issue key. The stored topic SHALL be SAFE-6 scrubbed.
`startWatchPoller` SHALL open the shared DB (in-memory for dry-run without
`CORVIDINHO_DATA_DIR`), accept an injected db or SessionStore, and close a DB
it opened on stop. Without a database the SessionStore stays in-memory.
The issue or PR thread's condensed conversation is kept apart from the
session and outlives its TTL (REQ-watch-472).

Acceptance Criteria
- A session created with a file DB is found by issue after reopening the DB.
- Activity within the TTL continues the session; idle past the TTL starts a new session and removes the old row.
- Expired rows are dropped when the store loads.
- A poller restarted on the same DB continues the same issue session.
- Stored topic has vendor-key-looking secrets redacted.
- A follow-up after the session's TTL starts a new session and still gets the thread's retained conversation replayed (REQ-watch-472).
