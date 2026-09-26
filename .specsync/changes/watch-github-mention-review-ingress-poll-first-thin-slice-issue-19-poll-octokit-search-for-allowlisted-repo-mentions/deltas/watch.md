---
module: watch
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
---

# Delta — watch (WATCH #19 poll-first ingress)

## Modified

### SPEC SECTION Purpose

Thin GitHub WATCH poll ingress: Octokit/fixture search → allowlist gate →
session stub for mention / issue_comment / review_request on allowlisted
targets (ALLOW-1). Poll-first for bot/VM; webhook deferred.

### SPEC SECTION Public API

loadWatchConfig, startWatchPoller, routeEvent, SessionStore, goLiveChecklist,
NOT_AUTHORIZED, filterNewEvents, containsMention, DetectedEvent types,
agent helpers, createFixtureSearchClient / createOctokitSearchClient.

### SPEC SECTION Invariants

Empty github orgs+repos fail-start; empty users = deny-all for triggers;
allowlist BEFORE session spawn; denied refuse quietly (no session); processed-id
dedup; no ProcessManager; no auto-merge; secrets out of repo; fixture tests
need no live webhook secrets.

### SPEC SECTION Behavioral Examples

Allowlisted mention→start_session; same repo#number→continue_session;
non-allowlisted user/repo→refuse quiet; duplicate id→skip; missing token /
empty repos refuse start cleanly.

### SPEC SECTION Error Cases

Missing token; missing mention username; empty repo allowlist; not authorized
(user/repo); already processed.

### SPEC SECTION Dependencies

src/allowlist/github.ts, @octokit/rest (live), agent task --no-verify.

### SPEC SECTION Change Log

WATCH poll-first thin (#19, 2026-09-26, corvid-agent): mention/review_request/issue_comment → allowlist → session stub; webhook deferred.

| 2026-09-26 | watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions: WATCH poll-first thin (#19) — mention/review_request/issue_comment → allowlist → session stub; webhook deferred |

### REQUIREMENT REQ-watch-001

The system SHALL document poll-first for bot/VM deploy and webhook when a public URL is available. Thin slice ships poll only.

Acceptance Criteria
- docs/WATCH.md + STATUS state the choice explicitly.

### REQUIREMENT REQ-watch-002

The poller SHALL map allowlisted mention / issue_comment / review_request events to session stubs (start or continue by owner/repo#number) via typed Octokit or an injectable search client.

Acceptance Criteria
- Fixture events → start_session / continue_session; no shell `gh`.

### REQUIREMENT REQ-watch-003

Every event SHALL pass repo + user allowlist gates before session spawn (ALLOW-1/2). Denied contacts SHALL refuse quietly with no session (ALLOW-5).

Acceptance Criteria
- Non-allowlisted user/repo → kind refuse/ignore; SessionStore unchanged.

### REQUIREMENT REQ-watch-004

Start SHALL fail cleanly when token, mention username, or github repo allowlist is missing/empty. Secrets stay out of repo.

Acceptance Criteria
- loadWatchConfig / CLI exit non-zero with go-live checklist.

### REQUIREMENT REQ-watch-005

Processed event ids SHALL be deduplicated. No ProcessManager; no auto-merge in this slice. CI fixture tests require no live webhook secrets.

Acceptance Criteria
- Second pass with same ids does not spawn; bun test green offline.
