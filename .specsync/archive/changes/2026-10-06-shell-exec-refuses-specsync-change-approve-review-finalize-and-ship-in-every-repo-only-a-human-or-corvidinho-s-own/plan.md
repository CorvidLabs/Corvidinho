---
change: shell-exec-refuses-specsync-change-approve-review-finalize-and-ship-in-every-repo-only-a-human-or-corvidinho-s-own
artifact: plan
---

# Plan

1. No `hi` capture (AGENT-18.a is on main, `hi/agent.md`); `hi check`.
2. `plugins/shell/sdd-lifecycle.ts`: `firstLifecycleStep`,
   `lifecycleRefuseMessage`, `lifecycleRefusal`, `HUMAN_LIFECYCLE_STEPS`.
3. `plugins/shell/commands.ts`: the refusal first in the handler; the
   description. `plugins/shell/must-ask.ts`: skip a refused command.
4. `tests/shell.sdd-lifecycle.test.ts`; fail-on-base proof (swap e1a24ed2's
   `commands.ts` and `must-ask.ts` in, remove `sdd-lifecycle.ts`, run,
   restore, run).
5. Docs (docs/DISCORD-GO-LIVE.md, docs/discord.md), spec prose, the delta and
   module testing evidence.
6. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
