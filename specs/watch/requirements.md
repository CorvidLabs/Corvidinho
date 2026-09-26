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
