---
change: spawned-agents-ignore-the-project-env-and-tests-never-create-real-worktrees-allow-4-safe-1-session-worktree-3-hygiene
artifact: testing
---

# Testing

- `tests/spawn.argv.test.ts`: argv shape; cwd `.env` value not visible to child.
- Full `bun test` leaves `git branch --list 'talk/*'` unchanged.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-133 | `tests/spawn.argv.test.ts`; bridge/slash fixtures with temp roots |
