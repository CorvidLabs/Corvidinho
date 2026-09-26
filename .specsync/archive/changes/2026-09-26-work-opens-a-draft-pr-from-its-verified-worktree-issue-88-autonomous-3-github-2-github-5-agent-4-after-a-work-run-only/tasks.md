---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: tasks
---

# Tasks

- [x] `src/work/pr-body.ts`: title, commit message, fenced + scrubbed body.
- [x] `src/work/pr.ts`: `openWorkPr` gates (run, worktree, changes, allowlist, repo gate, verify) and plugin chain.
- [x] `AgentSpawnResult.task` + Discord spawn client pass-through from the result frame.
- [x] `SlashContext.openWorkPr` injection; `/work` reply `PR:` line.
- [x] Fixture tests `tests/work.pr.test.ts`.
- [x] Spec delta REQ-discord-088; discord spec files, Public API, invariant; docs/discord.md.
- [x] tsc, bun test, specsync check, fledge verify green.
