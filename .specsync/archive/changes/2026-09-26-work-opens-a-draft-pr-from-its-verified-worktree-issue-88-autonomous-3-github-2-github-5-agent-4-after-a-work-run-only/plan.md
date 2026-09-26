---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: plan
---

# Plan

1. `src/work/pr-body.ts`: title, commit message, fenced + scrubbed body from
   name-status / diffstat / commits / verify source.
2. `src/work/pr.ts`: `openWorkPr` gate chain and plugin calls with injectable
   `runPlugin`, `git`, `verify`, `allowlist`, `repoGate`.
3. Hooks: `AgentSpawnResult.task`, Discord spawn client pass-through,
   `SlashContext.openWorkPr`, `/work` reply `PR:` line.
4. Fixture tests in `tests/work.pr.test.ts` (temp repos + local bare remote,
   dry-run github plugin, mocked verify).
5. Spec delta REQ-discord-088, spec files/front-matter, docs/discord.md.
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
