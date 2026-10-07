---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: tasks
---

# Tasks

- [x] Capture AGENT-13.a with `hi` (own commit); `hi check` passes.
- [x] `src/agent/providers.ts`, `src/agent/types.ts`, `src/agent/tier.ts`: the `cli` kind, skip / handover in the chain, `skipped` hops.
- [x] `src/agent/spend.ts`: `SpendGuard.call`; the guarded fetch uses it.
- [x] `plugins/fledge/spawn.ts`: `stdin` and `killTreeAfterExit` options.
- [x] `src/agent/headless-cli.ts` and `src/agent/execute.ts`: gate, turn, SAFE-2 guard, handover; `src/work/review.ts`: reviewer never `cli`.
- [x] Tests: `tests/agent.headless-cli.test.ts`; fail-on-base proof recorded in testing.md.
- [x] Docs (`docs/DISCORD-GO-LIVE.md`, `README.md`, `docs/DAEMON.md`), spec prose and files list, module testing evidence, deltas.
- [x] Review fixes: the CLI prompt gets the identity / untrusted-content rules and the hi / SpecSync lines; the env pass-through never overrides a scrubbed key; a worker's skipped hop stays `skipped` at the lead; `entryModelId` for `loadLlmEnv` and the spend snapshot; `--help` and `.env.example`.
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
