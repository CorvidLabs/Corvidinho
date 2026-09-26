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

