---
module: watch
version: 8
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
  - src/watch/index.ts

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
own mentions in search, document org-search pagination bury risk.

## Public API

loadWatchConfig, startWatchPoller, routeEvent, SessionStore, goLiveChecklist,
NOT_AUTHORIZED, filterNewEvents, containsMention, DetectedEvent types,
agent helpers, createFixtureSearchClient / createOctokitSearchClient,
ack helpers (shouldAckEvent, buildAckBody, AckClient, AckedIdStore).

## Invariants

Empty github orgs+repos fail-start; empty users = deny-all for triggers;
allowlist BEFORE session spawn; denied refuse quietly (no session); processed-id
dedup; no ProcessManager; no auto-merge; secrets out of repo; fixture tests
need no live webhook secrets; pollOnce errors logged not swallowed; own
watch-username comments/mentions skipped; auto-ack at most once per event id.

## Behavioral Examples

Allowlisted mention or assignment→start_session; same repo#number→continue_session;
non-allowlisted user/repo→refuse quiet; duplicate id→skip; missing token /
empty repos refuse start cleanly; poll cycle logs six counters; mention/comment
start/continue posts ack unless sender is watch username or already acked;
own-username comment omitted from events.

## Error Cases

Missing token; missing mention username; empty repo allowlist; not authorized
(user/repo); already processed.

## Dependencies

src/allowlist/github.ts, @octokit/rest (live), agent task --no-verify.

## Change Log

WATCH poll-first thin (#19, 2026-09-26, corvid-agent): mention/review_request/issue_comment → allowlist → session stub; webhook deferred.

| 2026-09-26 | watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions: WATCH poll-first thin (#19) — mention/review_request/issue_comment → allowlist → session stub; webhook deferred |
| 2026-09-26 | fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord: WATCH spawn uses buildCorvidinhoArgv (bun for .ts) |
| 2026-09-26 | github-write-plugins-issue-48: WATCH assignment events from issue/PR assignees |
| 2026-09-26 | github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create: GitHub write plugins + WATCH assignment ingress |
| 2026-09-26 | watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document: poll logging + error catch, auto-ack, ignore own mentions, pagination bury docs (REQ-watch-007) |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
