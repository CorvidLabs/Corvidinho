---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: plan
---

# Plan

1. Add `tests/fledge.core.test.ts` (fake fledge /bin/sh script in a mkdtemp
   PATH dir recording argv, cwd and env; real-fledge tests gated on fledge
   being installed); confirm it fails on `main`.
2. Add `plugins/fledge/core.ts` (`fledgeCoreCommands`,
   `loadFledgeCorePlugins`, resolver, child env, JSON parsers); re-export it
   from `plugins/fledge/index.ts`; call `loadFledgeCorePlugins()` from
   `src/plugins/builtins.ts`.
3. Narrow the `tests/fledge.plugins.test.ts` default-catalog assertion to
   Fledge plugin commands (the two core reads are now offered).
4. Deltas: plugins Added REQ-plugins-461, agent Modified REQ-agent-112; spec
   prose (purpose, public API, invariants, scenario, error rows, dependencies,
   files), plugins testing and tasks companions; `docs/DISCORD-GO-LIVE.md`
   dangerous-tool table, collision note and non-ADMIN read tools.
5. Run `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test` and `fledge lanes run verify --non-interactive`.
