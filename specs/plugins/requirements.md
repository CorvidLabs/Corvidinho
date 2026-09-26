---
spec: plugins.spec.md
---

## User Stories

- As an operator, I want typed plugins with danger markings so GitHub reads and meta list go through reviewed commands, not improvised shell.

## Acceptance Criteria

(Populated by SpecSync change materialize from deltas.)

## Constraints

- Secrets stay out of repo.
- GitHub write/create plugins out of scope for this change.

## Out of Scope

- Discord, PR create/merge plugins, autonomous extras.

### REQ-plugins-001

The system SHALL expose a typed plugin registry with register/list/get where list returns name, description, dangerous, and minTier (PLUGIN-1/2/6).

Acceptance Criteria
- `list()` returns sorted entries with name, description, dangerous, minTier.
- Builtins register github-* and plugins-list commands.

### REQ-plugins-002

When a command is marked dangerous and non-interactive mode is on, the runtime SHALL deny execution unless the command name is allowlisted (SAFE-1 / CLI-3).

Acceptance Criteria
- `danger-ping` under `--non-interactive` without allowlist exits 2 with Denied/SAFE-1.
- Allowlisted `danger-ping` succeeds.

### REQ-plugins-003

Built-in read-only GitHub commands SHALL call GitHub via Octokit (`GITHUB_TOKEN`/`GH_TOKEN`), not shell `gh` (GITHUB-1/4).

Acceptance Criteria
- github-pr-list/status/ci-status/issue-list use `@octokit/rest`.
- No `Bun.spawn(["gh", ...])` in plugin bodies.

### REQ-plugins-004

GitHub plugins SHALL require `--repo OWNER/REPO` and refuse repos matching CORVIDINHO_GITHUB_DENY_REPOS or outside CORVIDINHO_GITHUB_ALLOW_REPOS when set (GITHUB-6).

Acceptance Criteria
- Missing `--repo` exits non-zero with GITHUB-6 message.
- Denied repo exits with code 3 and clear error.

