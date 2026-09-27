---
module: watch
version: 16
status: draft
files:
  - src/watch/types.ts
  - src/watch/config.ts
  - src/watch/dedup.ts
  - src/watch/searcher.ts
  - src/watch/router.ts
  - src/watch/session-store.ts
  - src/watch/agent-client.ts
  - src/watch/poller.ts
  - src/watch/ack.ts
  - src/watch/summary.ts
  - src/watch/spawn-log.ts
  - src/watch/rate-limit.ts
  - src/watch/index.ts
  - tests/watch.auth-stop.test.ts

db_tables: []
depends_on:
  - plugins
  - agent
  - cli
---

# Watch

## Purpose

Thin GitHub WATCH poll ingress: Octokit/fixture search → allowlist gate →
session stub for mention / issue_comment / review_request / assignment on
allowlisted targets (ALLOW-1). Assignment when watch username is in issue/PR
assignees (#48). Poll-first for bot/VM; webhook deferred. Reliability harden:
per-cycle poll logging, caught pollOnce errors, auto-ack GitHub comment on
mention/comment start/continue (skip own username; once per event id), ignore
own mentions in search, document org-search pagination bury risk; plus
WATCH-RELIABILITY-1..3 — post-run summary after successful auto-ack, durable
spawn outcome logging, and GitHub 403 rate-limit backoff. WATCH sessions
persist in the shared SQLite DB (`watch_sessions`, schema v6) with the same
soft TTL as Discord sessions (SESSION-1..3, REQ-watch-037).

## Public API

loadWatchConfig, startWatchPoller, routeEvent, SessionStore, goLiveChecklist,
NOT_AUTHORIZED, filterNewEvents, containsMention, DetectedEvent types,
SessionStore options (`db`, `ttlMs`, `now`; `durable`), startWatchPoller
`db` / `sessionStore` / `sessionTtlMs` injection,
ProcessedIdStore / AckedIdStore / SummarizedIdStore options (`db`, `maxSize`;
`durable`), agent helpers, createFixtureSearchClient / createOctokitSearchClient,
ack helpers (shouldAckEvent, buildAckBody, AckClient, AckedIdStore),
summary helpers (buildSummaryBody, maybePostWatchSummary, SummarizedIdStore,
SuccessfulAckStore), spawn-log helpers (SpawnOutcomeStore, classifySpawnError),
rate-limit helpers (parseGithubRateLimit, GithubRateLimitError,
computeRateLimitBackoffMs), `StartWatchResult.fatal` / `WatchFatal`
(REQ-watch-418).

## Invariants

Empty github orgs+repos fail-start; empty users = deny-all for triggers;
allowlist BEFORE session spawn; denied refuse quietly (no session); processed-id
dedup; with a DB, processed / acked / summarized ids persist per kind in
`watch_event_ids` so a restart never replays a handled event id, and denied
ids are kept apart in memory so they never evict a handled id (REQ-watch-247);
no ProcessManager; no auto-merge; secrets out of repo; fixture tests
need no live webhook secrets; pollOnce errors logged not swallowed; own
watch-username comments/mentions skipped; auto-ack at most once per event id;
run summary at most once per event id and only after successful auto-ack;
spawn outcomes logged structurally and appended to durable JSONL; on GitHub
403 rate-limit back off via Retry-After/reset (default 60s) without tight loop;
WATCH agent spawn clears `CORVIDINHO_ACTING_DISCORD_USER_ID` and sets
`CORVIDINHO_ACTING_IS_ADMIN=0` so GitHub runs never act as a Discord memory
user (REQ-watch-008). With a DB, WATCH sessions reload on restart; a session
idle past the soft TTL (`resolveSessionTtlMs`, 30–60m, default 45m) is dropped
and the next event on that issue starts fresh; one session per
`owner/repo#number`; stored topic is SAFE-6 scrubbed; dry-run without
`CORVIDINHO_DATA_DIR` stays in-memory; the poller closes a DB it opened on stop
only after the in-flight cycle ends (REQ-watch-037). Poll cycles are
single-flight; after stop no further event is routed, acked, or spawned; one
failing event is logged and marked processed without aborting the cycle.
A GitHub 401 from a poll halts the loop (no re-arm), logs one line naming
`GITHUB_TOKEN / GH_TOKEN`, and settles `fatal` with exit code 1; the default
error sink prints one SAFE-6 scrubbed line per error, never the error object
(REQ-watch-418).

## Behavioral Examples

Allowlisted mention or assignment→start_session; same repo#number→continue_session;
non-allowlisted user/repo→refuse quiet; duplicate id→skip; missing token /
empty repos refuse start cleanly; poll cycle logs six counters; mention/comment
start/continue posts ack unless sender is watch username or already acked;
own-username comment omitted from events; after successful ack + spawn finish,
summary comment once per event id; spawn start/outcome log + JSONL row; 403
rate-limit schedules backoff and skips tight re-poll. Poller restarted on the
same data dir continues the same issue session; issue idle past TTL →
start_session with a new id.

## Error Cases

Missing token; missing mention username; empty repo allowlist; not authorized
(user/repo); already processed; GitHub 403 rate-limit backoff; GitHub 401
(bad or revoked token) stops the loop with exit 1.

## Dependencies

src/allowlist/github.ts, @octokit/rest (live), agent task --no-verify,
src/store (shared SQLite DB, session TTL, SAFE-6 scrub).

## Change Log

WATCH poll-first thin (#19, 2026-09-26, corvid-agent): mention/review_request/issue_comment → allowlist → session stub; webhook deferred.

| 2026-09-26 | watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions: WATCH poll-first thin (#19) — mention/review_request/issue_comment → allowlist → session stub; webhook deferred |
| 2026-09-26 | fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord: WATCH spawn uses buildCorvidinhoArgv (bun for .ts) |
| 2026-09-26 | github-write-plugins-issue-48: WATCH assignment events from issue/PR assignees |
| 2026-09-26 | github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create: GitHub write plugins + WATCH assignment ingress |
| 2026-09-26 | watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document: poll logging + error catch, auto-ack, ignore own mentions, pagination bury docs (REQ-watch-007) |
| 2026-09-26 | harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge: Harden memory plugin ACL (MEMORY-ACL-1..4 / SAFE-4 / issue #59 follow-up): acting Discord user and ADMIN come only from bridge-set env never model argv (--user/--admin/--db refused); ADMIN re-checked at handler time against live admin config with empty=deny-all; include-deleted is ADMIN-only; forget/override become real two-phase with an HMAC confirm token confirmed from a different turn; Discord/WATCH spawns always overwrite acting env |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging: WATCH-RELIABILITY-1..3 — post-run summary, spawn outcome JSONL, 403 rate-limit backoff; package 0.0.10 |
| 2026-09-26 | watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared: WATCH durable SessionStore (issue #37 slice 1, SESSION-1..3): WATCH sessions keyed by owner/repo#number persist in the shared SQLite DB (schema v6 watch_sessions) with the same soft TTL as Discord; activity keeps the session, idle past TTL starts fresh, sessions reload on restart; github watch opens the shared DB (in-memory for dry-run without a data dir and tests); topic scrubbed per SAFE-6; turn persistence/replay and summaries stay follow-ups |
| 2026-09-26 | discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still: Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice) |
| 2026-09-26 | watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log: WATCH run summary is secret-scrubbed before the thread comment and spawn log |
| 2026-09-26 | watch-handles-each-event-id-at-most-once-across-restarts-processed-acked-and-summarized-ids-persist-in-the-shared-db: WATCH handles each event id at most once across restarts: processed, acked and summarized ids persist in the shared DB and denied ids no longer evict handled ids |
| 2026-09-26 | watch-never-drops-or-skips-a-trusted-request-when-an-event-id-write-fails: WATCH never drops or skips a trusted request when an event-id write fails |
| 2026-09-26 | watch-listcomments-fetches-every-comment-inside-the-poll-window-so-an-mention-after-comment-50-on-a-long-issue-or-pr-is: WATCH listComments fetches every comment inside the poll window so an @mention after comment 50 on a long issue or PR is detected |
| 2026-09-26 | watch-listcomments-reads-page-1-plus-the-newest-pages-up-to-the-10-page-cap-so-a-flood-of-older-comments-cannot-hide: WATCH listComments reads page 1 plus the newest pages up to the 10-page cap so a flood of older comments cannot hide the newest mention |
| 2026-09-27 | clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or: Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401 |
| 2026-09-27 | the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the: The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85) |
