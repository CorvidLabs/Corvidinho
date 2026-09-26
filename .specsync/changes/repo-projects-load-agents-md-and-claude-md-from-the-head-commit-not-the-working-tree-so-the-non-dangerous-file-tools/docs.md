---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: docs
---

# Docs

- `specs/agent/agent.spec.md`: Public API paragraph names
  `NOT_COMMITTED_REASON`, `ProjectInstructions.source` and `uncommitted`;
  Invariants add the HEAD-only rule; Error Cases add the uncommitted,
  untracked / unborn, unusable `.git` and committed-symlink rows.
- Module doc comment in `src/agent/project-instructions.ts` explains why git
  projects read HEAD.
- Delta `deltas/agent.md` modifies REQ-agent-084.
- No README / CHANGELOG / STATUS edits (release PRs own those).
