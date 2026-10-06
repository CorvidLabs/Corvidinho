---
id: cover-github-7-incidental-paths-loop-guards-state-changing-tools-plugins-list-smoke-for-github-pr-merge
state: implementing
type: bug_fix
base_commit: 89f4d1efdaf5a5b495ab566e4cd1b51cafa53e81
---

# Cover GITHUB-7 incidental paths: loop-guards STATE_CHANGING_TOOLS + plugins list smoke for github-pr-merge

## Intent

Cover GITHUB-7 incidental paths: loop-guards STATE_CHANGING_TOOLS + plugins list smoke for github-pr-merge

## Affected Canonical Specs

- None

## Acceptance Criteria

- src/agent/loop-guards.ts lists github-pr-merge in STATE_CHANGING_TOOLS (REQ-agent-086 already covered by living agent specs/tests); tests/plugins.list.smoke.test.ts expects github-pr-merge in plugins list. Covered for SpecSync audit on the GITHUB-7 PR; no new module AC.

## No-spec Rationale

Incidental follow-ups already landed on the GITHUB-7 PR: classify github-pr-merge in STATE_CHANGING_TOOLS (REQ-agent-086 already in living agent specs) and expect github-pr-merge in plugins list smoke; no new acceptance criteria or living-spec prose changes.
