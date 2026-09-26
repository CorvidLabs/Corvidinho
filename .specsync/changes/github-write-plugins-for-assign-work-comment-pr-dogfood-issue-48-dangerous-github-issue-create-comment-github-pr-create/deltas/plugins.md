---
module: plugins
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
---

# Delta — plugins (GitHub writes #48)

## Modified

### SPEC SECTION Purpose

Plugin host includes Discord outbound post and GitHub write plugins as dangerous (GITHUB-2/3/5).

### SPEC SECTION Invariants

Builtin plugin loaders MAY re-register after an in-process registry clear
(test seam). Presence of an already-registered command name skips duplicate
register. GitHub write commands (`github-issue-create`, `github-issue-comment`,
`github-pr-create`, `github-pr-review`) are dangerous + minTier 1; SAFE-1
non-interactive deny unless CORVIDINHO_ALLOWLIST names them. Repo gate
(GITHUB-6 / ALLOW-1) still applies before any Octokit write. PR create appends
plain Made with Corvidinho attribution (no @handles). Dry-run via
CORVIDINHO_GITHUB_DRY_RUN=1.

### SPEC SECTION Error Cases

| Condition | Behavior |
|-----------|----------|
| Unknown plugin name | Throw / fail with Unknown plugin command |
| Dangerous + non-interactive + not allowlisted | Deny (exit 2) |
| Missing token / API fail on github-* | Clear error; non-zero exit |
| Dangerous github write + non-interactive + not allowlisted | Deny (exit 2, SAFE-1) |
| github write + empty/missing repo allowlist | Refuse (exit 3, GITHUB-6) |

### SPEC SECTION Dependencies

| Module | What is used |
|--------|-------------|
| @octokit/rest | REST list/view/checks + create/comment/review for gated write commands |

### SPEC SECTION Change Log

| 2026-09-26 | github-write-plugins-issue-48: dangerous issue/PR create comment review + attribution; SAFE-1 + GITHUB-6 |

### REQUIREMENT REQ-plugins-048

The system SHALL register github-issue-create, github-issue-comment, github-pr-create, and github-pr-review as dangerous plugins with minTier 1.

Acceptance Criteria
- plugins list marks each write command dangerous=true minTier=1.

### REQUIREMENT REQ-plugins-049

In non-interactive mode the system SHALL deny write plugins unless CORVIDINHO_ALLOWLIST includes the command name (SAFE-1 / GITHUB-5).

Acceptance Criteria
- runPlugin without allowlist returns exit 2 and SAFE-1 wording.

### REQUIREMENT REQ-plugins-050

Every write SHALL pass the GITHUB-6 / ALLOW-1 repo gate before Octokit; empty allowlists SHALL refuse with exit 3.

Acceptance Criteria
- allowlisted command with empty repo allowlist fails exit 3.

### REQUIREMENT REQ-plugins-051

github-pr-create SHALL append plain Made with Corvidinho markdown attribution when missing and SHALL NOT insert @handles.

Acceptance Criteria
- dry-run body contains Made with Corvidinho link and no @Corvidinho.

### REQUIREMENT REQ-plugins-052

When CORVIDINHO_GITHUB_DRY_RUN=1 the write handlers SHALL return success without calling Octokit so CI needs no live tokens.

Acceptance Criteria
- dry-run tests pass without GITHUB_TOKEN.
