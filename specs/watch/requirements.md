---
module: watch
---

# Requirements

### REQ-watch-001

The system SHALL document poll-first for bot/VM deploy and webhook when a public URL is available. Thin slice ships poll only.

Acceptance Criteria
- docs/WATCH.md + STATUS state the choice explicitly.

### REQ-watch-002

The poller SHALL map allowlisted mention / issue_comment / review_request events to session stubs (start or continue by owner/repo#number) via typed Octokit or an injectable search client.

Acceptance Criteria
- Fixture events → start_session / continue_session; no shell `gh`.

### REQ-watch-003

Every event SHALL pass repo + user allowlist gates before session spawn (ALLOW-1/2). Denied contacts SHALL refuse quietly with no session (ALLOW-5).

Acceptance Criteria
- Non-allowlisted user/repo → kind refuse/ignore; SessionStore unchanged.

### REQ-watch-004

Start SHALL fail cleanly when token, mention username, or github repo allowlist is missing/empty. Secrets stay out of repo.

Acceptance Criteria
- loadWatchConfig / CLI exit non-zero with go-live checklist.

### REQ-watch-005

Processed event ids SHALL be deduplicated. No ProcessManager; no auto-merge in this slice. CI fixture tests require no live webhook secrets.

Acceptance Criteria
- Second pass with same ids does not spawn; bun test green offline.



### REQ-watch-006

WATCH `createSpawnAgentClient` SHALL spawn via `buildCorvidinhoArgv` so a
`.ts` corvidinho bin is always invoked with `bun` (never posix_spawn alone).
Spawns SHALL NOT pass `--no-verify` — prove-before-done (AGENT-4 / FLEDGE-2)
is the default for ingress runs; an empty real diff with no tool-reported
files still skips verify inside the agent loop (REQ-agent-085). Fixture tests
SHALL cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
- Spawn argv is `task run --task <prompt> --output ndjson` with **no** `--no-verify`.
- No ProcessManager; allowlists unchanged.

### REQ-watch-048

WATCH SHALL emit an assignment DetectedEvent when the watch username appears in
issue/PR assignees from search results, using the same allowlist → session path
as mentions.

Acceptance Criteria
- Fixture with assignees includes assign-owner/repo#n event type assignment.

### REQ-watch-007

WATCH poll cycles SHALL log `fetched`, `new`, `started`, `continued`, `refused`,
and `skipped` counts each cycle. Errors from `pollOnce` SHALL be caught and
logged (not swallowed by fire-and-forget `void`). When the poller starts or
continues a session from an `issue_comment` or `issues` mention event whose
sender is not the watch username, it SHALL post a short GitHub issue comment
ack (with Made with Corvidinho attribution) at most once per event id.
`fetchWatchEvents` SHALL skip comments and issue-body mentions authored by the
watch username. Org/repo search MAY use `per_page` up to 100; docs SHALL note
that results beyond one page can bury non-primary-repo pings.

Acceptance Criteria
- Every successful poll cycle emits a log line with the six counters.
- Interval/immediate poll wrappers attach `.catch` and log failures.
- Ack skipped when sender === mentionUsername or event already acked.
- Ack only for issue_comment / issues on start_session / continue_session.
- Own-username comments/mentions absent from fetched events (fixture).
- docs/WATCH.md documents pagination bury risk; fixture tests need no live token.

### REQ-watch-008

The WATCH agent spawn SHALL clear `CORVIDINHO_ACTING_DISCORD_USER_ID` and
`CORVIDINHO_ACTING_CONFIRM_TOKENS`, set `CORVIDINHO_ACTING_IS_ADMIN=0`, and run
non-interactive (`CORVIDINHO_NON_INTERACTIVE=1`, SAFE-1). GitHub-originated runs have no Discord acting
user, so memory plugins refuse in them (MEMORY-ACL-1) instead of inheriting a
Discord identity from the watcher's environment.

Acceptance Criteria
- WATCH spawn env has an empty acting user, no confirm tokens, `CORVIDINHO_ACTING_IS_ADMIN=0` and `CORVIDINHO_NON_INTERACTIVE=1` even when the parent env sets them.

### REQ-watch-037

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
it opened on stop. Without a database the SessionStore stays in-memory. Turn
persistence/replay and stored summaries are out of scope.

Acceptance Criteria
- A session created with a file DB is found by issue after reopening the DB.
- Activity within the TTL continues the session; idle past the TTL starts a new session and removes the old row.
- Expired rows are dropped when the store loads.
- A poller restarted on the same DB continues the same issue session.
- Stored topic has vendor-key-looking secrets redacted.

### REQ-watch-073

The WATCH spawn agent client SHALL run
`task run --no-verify --task <prompt> --output ndjson`, read stdout line by
line, forward live state / current tool / token totals to an optional
`onStatus` callback (AGENT-8), and take the summary from the stream's `result`
frame, falling back to `summarizeTaskRunOutput` when no result frame parses.
No new GitHub-visible surface is added.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives the WATCH `onStatus` and returns the result-frame summary.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- Spawn argv ends with `--output ndjson` (no `--json`).

### REQ-watch-009

The system SHALL post a short agent summary comment on the same GitHub thread when the agent run finishes (success or failure), after a successful auto-ack on issue_comment or issues start_session or continue_session, at most once per event id, with Made with Corvidinho attribution (WATCH-RELIABILITY-1).

Acceptance Criteria
- Summary skipped when auto-ack did not succeed or event already summarized.
- Summary posted for both ok and non-zero exit runs.
- Fixture tests need no live GitHub token.

### REQ-watch-010

The system SHALL persist spawn outcome logging (start, exit code or error class, duration_ms) via a structured watch spawn log line and a durable JSONL store under the Corvidinho data dir (override CORVIDINHO_WATCH_SPAWN_LOG) readable without Discord (WATCH-RELIABILITY-2).

Acceptance Criteria
- Start and outcome log lines emitted per spawn.
- JSONL append contains eventId, exitCode, errorClass, durationMs.
- Fixture or temp-dir tests cover store without live Discord.

### REQ-watch-011

The system SHALL back off on GitHub 403 rate-limit (or 429) using Retry-After or x-ratelimit-reset headers, else a documented default of 60s, before the next poll cycle; SHALL NOT tight-loop; SHALL emit a clear watch github rate-limit backoff log line (WATCH-RELIABILITY-3).
The backoff SHALL cover every GitHub call the poller makes: the poll fetch, the auto-ack comment and the run-summary comment. A failed comment post SHALL keep its HTTP status and rate-limit headers (`retry-after`, `x-ratelimit-remaining`, `x-ratelimit-reset`) so the same backoff applies. No env var, config key, CLI or slash command is added.

Acceptance Criteria
- Retry-After seconds preferred; else reset; else 60s default.
- While backoff outstanding, pollOnce skips fetch.
- Plain 403 without rate-limit signal does not trigger backoff.
- A 403/429 rate limit on the auto-ack or run-summary comment sets the same backoff (Retry-After, else x-ratelimit-reset, else 60s): the `[watch] github rate-limit backoff` line follows the `ack failed` / `summary failed` line, and a pollOnce inside the backoff skips the fetch.
- A plain 403 on the auto-ack or run-summary comment logs only `ack failed` / `summary failed` and sets no backoff.
- WATCH-RELIABILITY-1 unchanged: a rate-limited ack gets no summary, a failed ack or summary is not retried, and the agent run still happens once.

### REQ-watch-085

WATCH `createSpawnAgentClient` SHALL always hold ingress runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / issue #85 captured slice): spawn
argv MUST NOT include `--no-verify`. Same skip as Discord: an empty real diff
with no tool-reported files skips verify; a run that changed the git working
tree is verified before done (REQ-agent-085).
Draft AGENT-14/15 out of scope. Package **0.0.13**. Fixture tests without live
tokens.

Acceptance Criteria
- WATCH spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/WATCH.md updated.
- Fixture tests + SpecSync + fledge verify green.
- A run that changed the git working tree without a tool reporting it is verified before done; a run with an empty real diff and no tool-reported files still skips verify (REQ-agent-085).

### REQ-watch-231

The system SHALL pass the WATCH run summary through the SAFE-6 secret scrubber
(`scrubSecrets`) before posting it as the post-run summary comment on the
GitHub thread (REQ-watch-009) and before writing it as `summaryPreview` to the
durable spawn-outcome JSONL (REQ-watch-010). This applies whatever the summary
came from: the agent result frame, the stderr fallback, or a thrown spawn
error. The scrub SHALL run before the text is clipped to its length cap, so a
secret cut at the cap never leaks as a partial prefix. Text with no secret is
posted and logged unchanged (SAFE-6; AGENTS.md Secrets).

Acceptance Criteria
- A token-shaped value (e.g. `ghp_…`) in the agent summary, the stderr fallback or a spawn error is posted and logged as `[redacted:<kind>]`, never raw.
- A token that starts just before the 1200-char comment cap or the 240-char preview cap leaves no `ghp_` prefix in either sink.
- Fixture tests need no live GitHub token or network.

### REQ-watch-247

When `startWatchPoller` has a database (the shared Corvidinho DB it opens, or an
injected `db`), the processed, acked and summarized event-id sets SHALL persist
in that DB (table `watch_event_ids`, one namespace per kind), so a watcher
restarted on the same data dir SHALL NOT route, ack, spawn or summarize an
event id it already handled (REQ-watch-005 / REQ-watch-007 / REQ-watch-009 "at
most once per event id", WATCH-RELIABILITY-1). The durable sets SHALL NOT evict
by count. Ids of events refused by the allowlist gate (ALLOW-1 / ALLOW-5) SHALL
be kept in a separate in-memory set that never shares or evicts the handled
ids, so a flood of non-allowlisted mentions cannot make a handled trusted
request run again. Ids are marked before any ack or spawn; if that write fails,
the event SHALL be logged and left for the next cycle without aborting the
cycle (REQ-watch-037), and SHALL NOT be marked by a retry later in the same
cycle, since nothing ran for it. Only a failure before the id write (routing)
is marked processed, as REQ-watch-037 already requires. The acked and
summarized id writes that follow a posted comment SHALL be best-effort: a
failure is logged and SHALL NOT skip the agent run or the summary for an event
that was already acknowledged. Without a database the stores stay in-memory
with the existing FIFO cap. Rows hold event ids only, never free text.

Acceptance Criteria
- A second poller started on the same data dir with the same fetched comment reports `new=0`, spawns no agent, and posts no second ack or summary.
- After a handled trusted comment, a cycle with 2000 non-allowlisted mentions refuses all 2000, and the next cycle neither starts nor continues the trusted request.
- Processed, acked and summarized ids written through one DB handle are found (case-insensitively) through a new handle on the same file, and kinds do not leak into each other; a durable store is not FIFO-capped.
- If marking an id fails, the cycle completes, nothing runs for that event, and the next cycle handles it once, even when an immediate retry of the write would have succeeded.
- If the acked or summarized id write fails after the comment is posted, the failure is logged, the agent still runs once and the summary is still posted once.
- Fixture tests need no live GitHub token or network.
### REQ-watch-234

For each search hit, the live WATCH search client SHALL fetch the issue or PR
comments updated inside the same poll window that `fetchWatchEvents` uses
for search, by passing `since` to `issues.listComments` with
`per_page=100`, so an @mention from an allowlisted user is seen even when the
thread has more than 50 comments (REQ-watch-002 / ALLOW-1). Requests per
thread SHALL be capped at 10 pages. Because GitHub lists an issue's comments
oldest-first, when the window holds more pages than the cap the client SHALL
read page 1 plus the newest pages (located via the `Link` `rel="last"` page
number), so a flood of older comments inside the window cannot hide the newest
@mention; without `rel="last"` it MAY follow `rel="next"` up to the cap.
Comments last updated before the window SHALL NOT be fetched.
`SearchClient.listComments` SHALL take the window as an optional `since`; the
fixture client MAY ignore it. Allowlist, dedup, own-username skip and event
shapes are unchanged.

Acceptance Criteria
- On an issue with 60 comments where only #60 is new and mentions the watch username, `fetchWatchEvents` with `createOctokitSearchClient` returns an `issue_comment` event for #60; every comments request carries `since`.
- On a thread with 150 comments inside the window and the mention at #150, the client follows the second page and the mention is detected.
- On a thread with 1100 comments inside the window and the mention at #1100, the mention is detected with exactly 10 comments requests (page 1 and pages 3-11).
- Without `rel="last"`, the client follows `rel="next"` and stops at 10 requests.
- A mention in a comment last updated before the window produces no event.
- No new env vars or commands; fixture tests need no live token.

### REQ-watch-418

A GitHub 401 (bad or revoked token) SHALL stop the WATCH poll loop instead of
polling forever, and poll errors SHALL be one clear line (CLI-4, SAFE-6).
The 403/429 rate-limit backoff (WATCH-RELIABILITY-3) is unchanged.

- When a poll in the loop throws an error whose `status` (or
  `response.status`) is 401, the poller SHALL stop re-arming the loop, log one
  line `[watch] github auth failed (401): <line> — check GITHUB_TOKEN /
  GH_TOKEN; watch stopped` (`<line>` = `formatErrorLine`, REQ-discord-417),
  and settle `StartWatchResult.fatal` with `{ exitCode: 1, message }`.
  `fatal` SHALL never settle otherwise. A direct `pollOnce()` caller still
  gets the error thrown.
- The default error sink SHALL print `<msg>: <formatErrorLine(err)>` as one
  string and SHALL NOT pass the error object to `console.error`.
- Any other poll error keeps polling at the configured interval.

Acceptance Criteria
- A poll that throws an Octokit-shaped 401 settles `fatal` with `exitCode` 1 and the exact line above, the error sink receives only that line (no error object), the token value is absent, and a later `pollOnce()` fetches nothing.
- With the default sink, a poll that throws a 500 prints exactly one string `[watch] pollOnce error: <scrubbed first line>`.
- A 403 rate limit with `retry-after: 120` still backs off about 120 s and does not settle `fatal`.
- `corvidinho github watch` with a token GitHub rejects exits 1 by itself with that line and no `HttpError` dump.

