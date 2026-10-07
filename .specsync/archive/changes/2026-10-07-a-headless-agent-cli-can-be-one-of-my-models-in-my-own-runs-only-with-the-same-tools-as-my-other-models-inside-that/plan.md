---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: plan
---

# Plan

1. Capture AGENT-13.a with `hi` (own commit); `hi check` passes.
2. `src/agent/providers.ts`: the `cli` kind, `cliArgv`, `cliProviderId`,
   `skipped` / `exit` failures, `failOver`, `callChain` skip / handover,
   `skipped` hops in the notices; `src/agent/types.ts` `ModelFallback.skipped`;
   `src/agent/tier.ts` `modelForTier` label.
3. `src/agent/spend.ts`: `SpendGuard.call`, the fetch on top of it.
4. `plugins/fledge/spawn.ts`: `stdin`, `killTreeAfterExit`.
5. `src/agent/headless-cli.ts`: gate, env, prompt, turn, output, SAFE-2 guard;
   `src/agent/execute.ts`: per-attempt verdict, `cliStep` / `cliTurn`,
   handover, escalation filter; `src/work/review.ts`: reviewer skips `cli`.
6. Tests `tests/agent.headless-cli.test.ts` (stand-in CLI on a temp PATH);
   fail-on-base proof.
7. Docs (`docs/DISCORD-GO-LIVE.md` E.9, README, `docs/DAEMON.md`), spec prose
   and files list, module testing evidence, deltas (REQ-agent-1301,
   REQ-plugins-1301 added; REQ-agent-179 modified).
8. `specsync change approve`, `change check --commit`, `change audit`,
   `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
