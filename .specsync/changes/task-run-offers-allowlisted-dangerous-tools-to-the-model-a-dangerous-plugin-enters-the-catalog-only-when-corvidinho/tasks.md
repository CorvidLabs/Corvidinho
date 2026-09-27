---
change: task-run-offers-allowlisted-dangerous-tools-to-the-model-a-dangerous-plugin-enters-the-catalog-only-when-corvidinho
artifact: tasks
---

# Tasks

- [x] Regression tests fail on main: 9 of 13 tests in tests/agent.allowlisted-dangerous.test.ts fail with origin/main's src/agent/tools.ts, execute.ts, types.ts and loop.ts swapped in (allowlisted GitHub writes, memory tools, files-delete and fledge-hello not offered; the non-git Fledge edit ended done with verify skipped); all 13 pass on the branch.
- [x] `buildOpenAiTools` offers a dangerous plugin only when the allowlist names it and it is not SAFE-3 pending.
- [x] `createTaskExecute` passes the run's allowlist and loads Fledge plugins only when the allowlist names a `fledge-*` command (or `includeDangerous`).
- [x] The tool loop records `unreportedEditTools`; `runTask` fails closed with no git snapshot.
- [x] REQ-agent-128 test updated: an unlisted interactive `danger-ping` and an allowlisted `shell-exec` are refused as not offered.
- [x] Deltas (Added REQ-agent-501 / REQ-agent-502; Modified REQ-agent-009 / 112 / 128 / 085), canonical requirements, agent.spec.md, testing.md.
- [x] Docs: docs/DISCORD-GO-LIVE.md E.3 and owner list, docs/discord.md (memory, /work PR), docs/WATCH.md, .env.example, STATUS.md.
- [x] Full suite, typecheck, SpecSync and the verify lane green.
