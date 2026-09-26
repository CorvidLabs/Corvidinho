---
module: plugins
change: plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface
---

# Delta — plugins (WATCH)

## Added

### REQUIREMENT REQ-plugins-001

The system SHALL expose a typed plugin registry with register/list/get where list returns name, description, dangerous, and minTier (PLUGIN-1/2/6).

Acceptance Criteria
- `list()` returns sorted entries with name, description, dangerous, minTier.
- Builtins register github-* and plugins-list commands.

### REQUIREMENT REQ-plugins-002

When a command is marked dangerous and non-interactive mode is on, the runtime SHALL deny execution unless the command name is allowlisted (SAFE-1 / CLI-3).

Acceptance Criteria
- `danger-ping` under `--non-interactive` without allowlist exits 2 with Denied/SAFE-1.
- Allowlisted `danger-ping` succeeds.

### REQUIREMENT REQ-plugins-003

Built-in read-only GitHub commands SHALL call `gh` only through typed plugin handlers and capture JSON stdout (GITHUB-1/4).

Acceptance Criteria
- github-pr-list, github-pr-status, github-ci-status, github-issue-list are registered.
- No create/write github commands are registered in this change.

### REQUIREMENT REQ-plugins-004

GitHub plugins SHALL require `--repo OWNER/REPO` and refuse repos matching CORVIDINHO_GITHUB_DENY_REPOS or outside CORVIDINHO_GITHUB_ALLOW_REPOS when set (GITHUB-6).

Acceptance Criteria
- Missing `--repo` exits non-zero with GITHUB-6 message.
- Denied repo exits with code 3 and clear error.

## Modified

### SPEC SECTION Change Log

WATCH: host + github read + SAFE-1 deny + repo deny gate (2026-09-26, corvid-agent).

### SPEC SECTION Invariants

Add GITHUB-6 repo gate invariant; keep danger/minTier and gh-helper invariants.
