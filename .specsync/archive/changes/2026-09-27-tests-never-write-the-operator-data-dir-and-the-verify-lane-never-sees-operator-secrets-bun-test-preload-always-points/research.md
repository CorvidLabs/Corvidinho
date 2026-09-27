---
change: tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points
artifact: research
---

# Research

- Env reads that select a write path (`grep env.*_DIR|_FILE|_PATH|_LOG` over
  src/plugins): `CORVIDINHO_DATA_DIR` (store/paths.ts; bridge/poller dry-run
  DB choice), `CORVIDINHO_ALLOWLIST_FILE` (already forced by the preload),
  `CORVIDINHO_WATCH_SPAWN_LOG` (watch/spawn-log.ts, defaults under the data
  dir), `WORKTREE_BASE_DIR` (worktree/manager.ts, defaults to a sibling of
  the project). Key that signs rows: `CORVIDINHO_AUDIT_HMAC_KEY`
  (audit/log.ts). `HOME`-based paths are covered by the data dir and the
  allowlist file override.
- Secrets src reads: `DISCORD_TOKEN` / `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN` /
  `GH_TOKEN`, `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`,
  `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_ACTING_*` (confirm tokens, admin).
- `src/autonomous/delegate.ts` `isWorkerEnvDropped` already drops
  `DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY`,
  `CORVIDINHO_ACTING_*` for workers but keeps LLM keys (a worker calls the
  model). The verify lane never needs an LLM key, so it drops those too.
- Bun 1.4.2: `Bun.spawn` / `Bun.spawnSync` without `env` use the startup
  environ, not the edited `process.env` (checked with a probe script);
  `Bun.which` likewise resolves PATH as the process started. 88 spawn sites
  in src/plugins/tests; `Bun.spawn` is assignable. No src code mutates
  `process.env`, so in production the default is unchanged.
