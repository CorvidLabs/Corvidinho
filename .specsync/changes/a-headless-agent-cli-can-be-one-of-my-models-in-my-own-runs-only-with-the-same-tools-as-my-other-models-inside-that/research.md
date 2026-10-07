---
change: a-headless-agent-cli-can-be-one-of-my-models-in-my-own-runs-only-with-the-same-tools-as-my-other-models-inside-that
artifact: research
---

# Research

- Sources: the interview record `/home/user/coord/interview-2026-09-28.md`
  (round 17, 2026-10-07, AGENT-13 headless agent CLI: owner runs, full
  tools); #320 (AGENT-13 in part: `kind:model` entries, "Not built: AGENT-13's
  headless agent CLI kind"); SAFE-3.a (#83, #124, `src/agent/shell-gate.ts`,
  REQ-agent-503 / REQ-cli-681); AGENT-11 (`callChain`, REQ-agent-080).
- Model config on main: `parseModelEntry` / `modelChainForTier` /
  `resolveEntry` / `providerId` (`src/agent/providers.ts`); one
  `ModelChain` per `task run` process (`createTaskExecute`); every model call
  through `callModels` → `callChain` → `chatCompletions`; other readers of the
  model list: `tier.ts` (`modelForTier`, `perTierModels`), `spend.ts`
  (`configuredProviderIds`, unpriced tier flags), `src/work/review.ts`
  (`configuredModels`, `resolveReviewer`). Condensation (SESSION-5) makes no
  model call.
- Where the shell runs and with what: `shellToolsGate` (owner, interactive
  surface, own talk worktree, no worker / WATCH / schedule), `allowlistOffers`
  (allowlist + grant), `shell-exec` min tier code, SAFE-13 drops mutating tools;
  `runnerChildEnv` (verify-lane scrub, `withoutGitCredentials`,
  `withoutCloudCredentials`, `CORVIDINHO_PROJECT_ROOT`), `spawnCapped`
  (process group, timeout, abort, output caps; stdin closed).
- Headless agent CLIs take a prompt on stdin and print a final answer (Claude
  Code `claude -p`, optionally `--output-format json` with `result` and
  `usage`; `codex exec -`); their built-in tools (shell, file edits) are
  configured by the CLI itself, so Corvidinho cannot narrow them to its
  allowlist.
- SAFE-2 on main is a file-tool guard (`isProtectedPath`, `isSddRecordPath`);
  the verify gate judges the real diff (`startWorkspaceDiff`, nested trackers
  never touch the verified marker) with the hi and SpecSync gates.
- The SAFE-8 guard wraps the provider fetch only; its unknown-price path
  (SAFE-16.a) already asks on a card for an unpriced model under a covering cap.
