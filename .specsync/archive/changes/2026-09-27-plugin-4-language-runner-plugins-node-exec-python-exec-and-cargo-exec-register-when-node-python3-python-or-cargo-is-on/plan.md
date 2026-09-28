---
change: plugin-4-language-runner-plugins-node-exec-python-exec-and-cargo-exec-register-when-node-python3-python-or-cargo-is-on
artifact: plan
---

# Plan

1. Add `tests/runners.plugins.test.ts` (stub toolchains in a mkdtemp PATH dir;
   real-toolchain smoke gated on `Bun.which`); confirm it fails on `main`.
2. Add `plugins/runners/commands.ts` and `plugins/runners/index.ts`; call
   `loadRunnerPlugins()` from `src/plugins/builtins.ts`; print
   `runnerStatusLines` in `plugins list` (`src/cli.ts`).
3. Add REQ-plugins-313 / 314 and modify REQ-cli-112 (deltas); update the plugins spec (purpose, API,
   invariant, scenarios, error rows, dependencies, files, change log),
   testing and tasks companions; add the runners to the dangerous-tools table in
   `docs/DISCORD-GO-LIVE.md`.
4. Run `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test` and `fledge lanes run verify --non-interactive`.
