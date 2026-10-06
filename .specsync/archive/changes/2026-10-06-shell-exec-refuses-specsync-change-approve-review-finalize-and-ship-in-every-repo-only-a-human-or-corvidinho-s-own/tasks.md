---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: tasks
---

# Tasks

- [x] Confirm AGENT-18.a is captured on main; nothing new to capture; `hi check` passes.
- [x] `plugins/shell/sdd-lifecycle.ts`: `firstLifecycleStep`, `lifecycleRefuseMessage`, `lifecycleRefusal`, `HUMAN_LIFECYCLE_STEPS` over `forEachSimpleCommand` / `commandChain`.
- [x] `plugins/shell/commands.ts`: the AGENT-18.a refusal first in `shell-exec`; description updated.
- [x] `plugins/shell/must-ask.ts`: `shellProdWhy` skips a command the check refuses.
- [x] `tests/shell.sdd-lifecycle.test.ts` (11 tests); fail-on-base proof recorded in testing.md.
- [x] docs/DISCORD-GO-LIVE.md, docs/discord.md, spec prose, delta and module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
