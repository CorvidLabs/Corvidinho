---
id: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
state: draft
type: bug_fix
base_commit: 65cff62fdae8cb0413d92adfe8acb29455fc127f
---

# Discord project option stays inside the bridge project root or an allowlisted sibling repo checkout (ALLOW-2, ALLOW-6, SAFE-3, DISCORD-SCHEDULE-3)

## Intent

Discord project option stays inside the bridge project root or an allowlisted sibling repo checkout (ALLOW-2, ALLOW-6, SAFE-3, DISCORD-SCHEDULE-3)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A /work, /session start or /schedule project that is an absolute path, ../ traversal or symlink outside the bridge project root is refused with not authorized before any worktree, talk branch or agent run; a sibling checkout runs only when its origin OWNER/REPO passes the GitHub repo allowlist (deny wins, empty = deny); schedule ticks re-check the same rule

## No-spec Rationale

Not applicable
