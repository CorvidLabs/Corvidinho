---
module: watch
version: 1
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
session stub for mention / issue_comment / review_request on allowlisted
targets (ALLOW-1). Poll-first for bot/VM; webhook deferred.

## Public API

loadWatchConfig, startWatchPoller, routeEvent, SessionStore, goLiveChecklist,
NOT_AUTHORIZED, filterNewEvents, containsMention, DetectedEvent types,
agent helpers, createFixtureSearchClient / createOctokitSearchClient.

## Invariants

Empty github orgs+repos fail-start; empty users = deny-all for triggers;
allowlist BEFORE session spawn; denied refuse quietly (no session); processed-id
dedup; no ProcessManager; no auto-merge; secrets out of repo; fixture tests
need no live webhook secrets.

## Behavioral Examples

Allowlisted mention→start_session; same repo#number→continue_session;
non-allowlisted user/repo→refuse quiet; duplicate id→skip; missing token /
empty repos refuse start cleanly.

## Error Cases

Missing token; missing mention username; empty repo allowlist; not authorized
(user/repo); already processed.

## Dependencies

src/allowlist/github.ts, @octokit/rest (live), agent task --no-verify.

## Change Log

WATCH poll-first thin (#19, 2026-09-26, corvid-agent): mention/review_request/issue_comment → allowlist → session stub; webhook deferred.

| 2026-09-26 | watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions: WATCH poll-first thin (#19) — mention/review_request/issue_comment → allowlist → session stub; webhook deferred |

