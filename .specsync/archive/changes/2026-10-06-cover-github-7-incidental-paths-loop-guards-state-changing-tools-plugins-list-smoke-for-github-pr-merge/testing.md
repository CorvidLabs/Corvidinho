---
change: cover-github-7-incidental-paths-loop-guards-state-changing-tools-plugins-list-smoke-for-github-pr-merge
artifact: testing
---

# Testing

- `bun test tests/agent.loop-guards.test.ts -t "every registered dangerous"`
  — `github-pr-merge` is in `STATE_CHANGING_TOOLS`, not unclassified.
- `bun test tests/plugins.list.smoke.test.ts` — `plugins list` output
  contains `github-pr-merge`.
- `specsync change audit` — no uncovered meaningful paths from this PR.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| (no-spec cover) | `tests/agent.loop-guards.test.ts` classification; `tests/plugins.list.smoke.test.ts` | paths covered for SDD audit only; REQ-agent-086 already in living agent specs |
| all | `specsync change audit` | green on this branch |
