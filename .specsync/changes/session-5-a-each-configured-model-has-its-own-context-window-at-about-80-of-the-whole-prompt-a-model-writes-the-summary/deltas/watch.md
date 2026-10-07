---
module: watch
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
---

# Delta: watch (the poller hands the run the thread's conversation and keeps the model-written summary it reports — SESSION-5.a)

## Modified

### REQUIREMENT REQ-watch-472

WATCH follow-ups SHALL pick up the issue or PR thread's summary (AGENT-6.a,
with SESSION-5; issue #72). With a database, `startWatchPoller` SHALL keep
one retained conversation per issue or PR in the shared
`conversation_threads` table (schema v13, REQ-discord-472): surface
`watch`, thread key `issue:<owner/repo lowercased>#<number>`, the thread's
first sender (lowercased GitHub login) as its person, and every sender whose
event ran as a participant (`github:<login>`).

After each run on an issue or PR (whether it succeeded, failed or threw),
the event's prompt (as a human turn) and the run's answer (as an agent turn:
its summary, or, for a failed run without an ask of its own, the one reason
line its comment shows, REQ-watch-009, never a provider's reply body or host) SHALL be
added to that thread's conversation, scrubbed (SAFE-6), its
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
(REQ-agent-004), whole (the poller folds nothing), and SHALL hand the run
the same conversation (`AgentRunChatOpts.conversation`, sent with the task
on stdin, `task run --task-stdin`, REQ-cli-473). The run SHALL condense it at
about 80% of its model's own window, the whole prompt counted, and that
model SHALL write the summary (REQ-agent-473; same window rules as
REQ-discord-472), the thread's opening request and its newest request kept
word for word (a human turn is kept up to the 8000-char WATCH event prompt,
so a whole event prompt is never clipped; its own fence header is marked
`(quoted)` like any block-like line, its fence markers and fenced words
unchanged, SAFE-12). The run's checked report (`AgentSpawnResult.conversation`)
SHALL be what the thread keeps: its summary, and its kept turns without the
folded ones (`withoutFolded`), before the new event and answer are added; an
extractive report (the model's summary call failed) is kept the same way and
logged `[watch] SESSION-5.a: <model> did not write the summary (<reason>);
kept the extractive summary of N condensed turns (<owner/repo>#<n>)`. The commenter's and project
memory blocks (REQ-watch-067) go ahead of this block. Another issue or PR never gets
it. A record SHALL be purged 30 days after its last update (every read and
write purges first, and every poll cycle purges), and forgetting a person
(`forgetConversations(db, { githubLogins })`, case-insensitive; an approved
forget-me of a declared person uses their linked GitHub logins,
REQ-discord-472) SHALL delete every thread they started or commented on. No GitHub-visible surface, env
var beyond the windows, config key or CLI flag is added.

Acceptance Criteria
- A follow-up on the same issue gets the earlier event and answer replayed, oldest first, ahead of the new event; the first event and another issue get no block; `planningSelectionText` leaves the block out.
- Two hours later (past the session's TTL) the follow-up still gets it; 30 days after the last update it is purged and the next event gets no block.
- The run gets the thread's whole conversation (exactly the block in its prompt); the summary it reports replaces the folded turns in the next prompt and in the stored record, with the opening request and the latest request word for word; an extractive report is kept and logged (`tests/watch.conversation.test.ts`).
- An opening event prompt of over 7000 chars replays whole (word for word, its fence header marked `(quoted)`) in the follow-up's block.
- The stored turns hold `[redacted:github-token]`, never the token; participants are the lowercased senders; forgetting a login that only commented deletes the thread.
- A failed run's kept agent turn is the reason line its comment shows (`The model call failed (429 Too Many Requests)`, no host), never the provider's reply body; a successful run's is its summary (`tests/watch.failed-comment.test.ts`).
