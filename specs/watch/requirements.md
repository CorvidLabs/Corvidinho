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
Prefer `--no-verify` for ingress latency. Fixture tests SHALL cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
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

Acceptance Criteria
- Retry-After seconds preferred; else reset; else 60s default.
- While backoff outstanding, pollOnce skips fetch.
- Plain 403 without rate-limit signal does not trigger backoff.

