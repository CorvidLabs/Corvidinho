---
module: watch
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
---

# Delta: watch (a failed run's comment says why in one plain line, never the provider's reply body — DISCORD-3.b's reason on GitHub)

## Modified

### REQUIREMENT REQ-watch-009

The system SHALL post a short agent summary comment on the same GitHub thread when the agent run finishes (success or failure), after a successful auto-ack on issue_comment or issues start_session or continue_session, at most once per event id, with Made with Corvidinho attribution (WATCH-RELIABILITY-1).

A failed run without an ask of its own (a non-zero exit, or a spawn that
threw) SHALL say why in one plain line and SHALL NOT post its run summary,
which for a model failure is `LLM HTTP <status>: <provider body>` — the
provider's reply (account or org names, request ids, quota details), which
must never reach a public thread. Under `Corvidinho WATCH run summary —
Failed (exit N).` the comment SHALL carry `watchFailureReason(spawn, env)`
(`src/watch/summary.ts`), the same reason the Discord surfaces give
(`failureReasonFor`, `src/discord/failure-reason.ts`, REQ-discord-032):
the `task run` result's `error` (which model call failed and how —
`The model call failed (<status> <name> from <host>)`, status and host only;
the no-provider notice; which verify failed), which the WATCH spawn client
hands over as `AgentSpawnResult.failureReason`; else the no-provider notice
for the run's tier in the watcher's env; else the last meaningful line of the
run's stderr (`AgentSpawnResult.stderrTail`); else the exit code. A thrown
spawn's message stands in for the result's `error`. The line is SAFE-6
scrubbed first, stack frames and host paths are dropped, and it is at most
200 characters; the SAFE-13 owner line and the footer follow as before. The
poller SHALL log `[watch] run failed (<owner/repo>#<n> id=<event id>, exit
N): <reason>` (no `, exit N` for a spawn that threw) and keep that line as
the run's agent turn in the thread's conversation (REQ-watch-472), so a later
run never replays a provider body to the model. The operator-only
spawn-outcome JSONL keeps the scrubbed run summary as `summaryPreview`
(REQ-watch-010, REQ-watch-231). A successful run's comment, a failed run that
stopped on an ask of its own (its summary carries `Needs your input: …`,
REQ-watch-086) and a spend-cap stop ("Work is paused for budget.",
SAFE-14.a, REQ-watch-099) are unchanged. No env var, config key or
GitHub-visible surface is added.

Acceptance Criteria
- Summary skipped when auto-ack did not succeed or event already summarized.
- Summary posted for both ok and non-zero exit runs.
- Fixture tests need no live GitHub token.
- Through `startWatchPoller` and the real `task run` against a localhost model that answers 429 with an org name and a request id, the summary comment is exactly `Corvidinho WATCH run summary — Failed (exit 1).`, `The model call failed (429 Too Many Requests from 127.0.0.1:<port>)` and the footer; no comment or log line has the org name, the request id or `LLM HTTP`; the log has `[watch] run failed (CorvidLabs/Corvidinho#42 id=…, exit 1): <that line>`; the thread's agent turn is that line; the spawn log's `summaryPreview` starts `LLM HTTP 429: `.
- With no result `error` (and a model configured) a failed run's comment is its scrubbed stderr end (host paths cut, a token `[redacted:…]`), else `The run failed (exit N) without saying why`; a thrown spawn's comment and log line are its scrubbed one-line message with no exit code.
- A successful run's comment is unchanged; a failed run with a stuck ask keeps its summary with `Needs your input: …`; a spend-cap stop keeps "Work is paused for budget.".
- `tests/watch.failed-comment.test.ts` fails on main's `src/watch` sources and passes on the branch.

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
line its comment shows, REQ-watch-009, never a provider's reply body) SHALL be
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
(REQ-agent-004). At about 80% of the model's window
(`CORVIDINHO_LLM_CONTEXT_TOKENS`, same budget as REQ-discord-472) the
oldest turns SHALL be folded into the summary, the thread's opening request
and its newest request kept word for word (a human turn is kept up to the
8000-char WATCH event prompt, so a whole event prompt is never clipped; its
own fence header is marked `(quoted)` like any block-like line, its fence
markers and fenced words unchanged, SAFE-12). The commenter's and project
memory blocks (REQ-watch-067) go ahead of this block. Another issue or PR never gets
it. A record SHALL be purged 30 days after its last update (every read and
write purges first, and every poll cycle purges), and forgetting a person
(`forgetConversations(db, { githubLogins })`, case-insensitive; an approved
forget-me of a declared person uses their linked GitHub logins,
REQ-discord-472) SHALL delete every thread they started or commented on. No GitHub-visible surface, env
var beyond the window, config key or CLI flag is added.

Acceptance Criteria
- A follow-up on the same issue gets the earlier event and answer replayed, oldest first, ahead of the new event; the first event and another issue get no block; `planningSelectionText` leaves the block out.
- Two hours later (past the session's TTL) the follow-up still gets it; 30 days after the last update it is purged and the next event gets no block.
- With a 1024-token window a long thread's prompt stays under the budget with the summary, the opening request and the latest request word for word.
- An opening event prompt of over 7000 chars replays whole (word for word, its fence header marked `(quoted)`) in the follow-up's block.
- The stored turns hold `[redacted:github-token]`, never the token; participants are the lowercased senders; forgetting a login that only commented deletes the thread.
- A failed run's kept agent turn is its reason line (`The model call failed (429 Too Many Requests from …)`), never the provider's reply body; a successful run's is its summary (`tests/watch.failed-comment.test.ts`).

### REQUIREMENT REQ-watch-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the chain is REQ-agent-080). The WATCH spawn client SHALL read the
result frame's `modelFallback` (`modelFallbackFromUnknown`, validated) and,
when a run failed over, call its `onModelFallback(hops, sessionId)` option, by
default one warn line `[watch] llm.fallback: <a> failed (<reason>), fell back
to <b>[; …] (session <id>)` (`warnWatchModelFallback`) — how the owner hears of
a failover in a commenter's run, besides the note; no DM. The run summary
comment of a run that still finished SHALL keep the run's closing
`(model fallback: …)` note when its 1800 cap clips a long summary
(`chatBodyFromTaskResult`, REQ-agent-080); a run that failed after failing
over posts its one reason line instead (REQ-watch-009), and the warn line
still names the failover. No env var or config key is added.

Acceptance Criteria
- A fake bin whose result frame reports `gpt-5` → `gpt-4.1` (HTTP 404): the WATCH client's summary ends with the note and `[watch] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1 (session w1)` is logged as a warning.
