---
module: watch
change: watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging
---

# Delta — watch (WATCH-RELIABILITY-1..3)

## Modified

### SPEC SECTION Purpose

Thin GitHub WATCH poll ingress: Octokit/fixture search → allowlist gate →
session stub for mention / issue_comment / review_request / assignment on
allowlisted targets (ALLOW-1). Assignment when watch username is in issue/PR
assignees (#48). Poll-first for bot/VM; webhook deferred. Reliability harden:
per-cycle poll logging, caught pollOnce errors, auto-ack GitHub comment on
mention/comment start/continue (skip own username; once per event id), ignore
own mentions in search, document org-search pagination bury risk; plus
WATCH-RELIABILITY-1..3 — post-run summary after successful auto-ack, durable
spawn outcome logging, and GitHub 403 rate-limit backoff.

### SPEC SECTION Public API

loadWatchConfig, startWatchPoller, routeEvent, SessionStore, goLiveChecklist,
NOT_AUTHORIZED, filterNewEvents, containsMention, DetectedEvent types,
agent helpers, createFixtureSearchClient / createOctokitSearchClient,
ack helpers (shouldAckEvent, buildAckBody, AckClient, AckedIdStore),
summary helpers (buildSummaryBody, maybePostWatchSummary, SummarizedIdStore,
SuccessfulAckStore), spawn-log helpers (SpawnOutcomeStore, classifySpawnError),
rate-limit helpers (parseGithubRateLimit, GithubRateLimitError,
computeRateLimitBackoffMs).

### SPEC SECTION Invariants

Empty github orgs+repos fail-start; empty users = deny-all for triggers;
allowlist BEFORE session spawn; denied refuse quietly (no session); processed-id
dedup; no ProcessManager; no auto-merge; secrets out of repo; fixture tests
need no live webhook secrets; pollOnce errors logged not swallowed; own
watch-username comments/mentions skipped; auto-ack at most once per event id;
run summary at most once per event id and only after successful auto-ack;
spawn outcomes logged structurally and appended to durable JSONL; on GitHub
403 rate-limit back off via Retry-After/reset (default 60s) without tight loop;
WATCH agent spawn clears `CORVIDINHO_ACTING_DISCORD_USER_ID` and sets
`CORVIDINHO_ACTING_IS_ADMIN=0` so GitHub runs never act as a Discord memory
user (REQ-watch-008).

### SPEC SECTION Behavioral Examples

Allowlisted mention or assignment→start_session; same repo#number→continue_session;
non-allowlisted user/repo→refuse quiet; duplicate id→skip; missing token /
empty repos refuse start cleanly; poll cycle logs six counters; mention/comment
start/continue posts ack unless sender is watch username or already acked;
own-username comment omitted from events; after successful ack + spawn finish,
summary comment once per event id; spawn start/outcome log + JSONL row; 403
rate-limit schedules backoff and skips tight re-poll.

### SPEC SECTION Error Cases

Missing token; missing mention username; empty repo allowlist; not authorized
(user/repo); already processed; GitHub 403 rate-limit backoff.

### SPEC SECTION files (frontmatter)

Add:
- src/watch/summary.ts
- src/watch/spawn-log.ts
- src/watch/rate-limit.ts

### SPEC SECTION Change Log

| 2026-09-26 | watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging: WATCH-RELIABILITY-1..3 — post-run summary, spawn outcome JSONL, 403 rate-limit backoff; package 0.0.10 |

## Added

### REQUIREMENT REQ-watch-009

The system SHALL post a short agent summary comment on the same GitHub thread when the agent run finishes (success or failure), after a successful auto-ack on issue_comment or issues start_session or continue_session, at most once per event id, with Made with Corvidinho attribution (WATCH-RELIABILITY-1).

Acceptance Criteria
- Summary skipped when auto-ack did not succeed or event already summarized.
- Summary posted for both ok and non-zero exit runs.
- Fixture tests need no live GitHub token.

### REQUIREMENT REQ-watch-010

The system SHALL persist spawn outcome logging (start, exit code or error class, duration_ms) via a structured watch spawn log line and a durable JSONL store under the Corvidinho data dir (override CORVIDINHO_WATCH_SPAWN_LOG) readable without Discord (WATCH-RELIABILITY-2).

Acceptance Criteria
- Start and outcome log lines emitted per spawn.
- JSONL append contains eventId, exitCode, errorClass, durationMs.
- Fixture or temp-dir tests cover store without live Discord.

### REQUIREMENT REQ-watch-011

The system SHALL back off on GitHub 403 rate-limit (or 429) using Retry-After or x-ratelimit-reset headers, else a documented default of 60s, before the next poll cycle; SHALL NOT tight-loop; SHALL emit a clear watch github rate-limit backoff log line (WATCH-RELIABILITY-3).

Acceptance Criteria
- Retry-After seconds preferred; else reset; else 60s default.
- While backoff outstanding, pollOnce skips fetch.
- Plain 403 without rate-limit signal does not trigger backoff.
