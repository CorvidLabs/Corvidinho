---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: tasks
---

# Tasks

- [x] Capture IDENTITY-12.a with `hi` (own commit); `hi check` passes.
- [x] `src/plugins/roles.ts`: `isWatchRunEnv`, the GitHub-id path in `resolveActingIsAdmin` / `resolveActingRole` (deny / mute, fail closed), `actingWorkTask` false on WATCH.
- [x] `src/watch/router.ts` (`watchTriggerRole`, role line), `src/watch/poller.ts` (`actingRole`), `src/watch/agent-client.ts` (role stamp, `WORK_TASK=0`).
- [x] `plugins/files/protectedPaths.ts`: secret paths hidden on WATCH for every role.
- [x] `src/agent/execute.ts`: no discovered Fledge plugin command in a WATCH run, even the owner's; test in `tests/agent.allowlisted-dangerous.test.ts`.
- [x] `tests/watch.github-roles.test.ts` (12 tests); fail-on-base proof recorded in testing.md.
- [x] Update `tests/identity.recognise.test.ts` (new owner role line) and `tests/agent.safe3a-owner-shell.test.ts` (a watch stamp never takes a Discord id; the owner's GitHub-stamped WATCH run keeps its other tools, never the shell).
- [x] docs/WATCH.md, docs/discord.md, docs/DISCORD-GO-LIVE.md; spec prose (watch, plugins, agent), deltas, module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
