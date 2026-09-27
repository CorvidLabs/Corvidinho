---
change: tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points
artifact: design
---

# Design

- `tests/preload.ts` (test harness, not shipped):
  - Always `process.env.CORVIDINHO_DATA_DIR = <mkdtemp>` (was: only when unset),
    same pattern as the existing forced `CORVIDINHO_ALLOWLIST_FILE`.
  - `delete` `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG`,
    `WORKTREE_BASE_DIR`; unset, they fall back to the scratch data dir / a
    temp project's sibling, which is what CI already sees.
  - Wrap `Bun.spawn` and `Bun.spawnSync`: when the options (argv form or
    `{ cmd }` form) have no `env`, pass `{ ...process.env }`. Explicit
    `env` objects are untouched. This makes the preload's env (and per-test
    `process.env` edits) reach every child, as `node:child_process` does.
- `src/agent/verify.ts`: `isVerifyEnvDropped(key)` = `isWorkerEnvDropped(key)`
  (reused from delegate.ts) or `CORVIDINHO_LLM_API_KEY` / `OPENAI_API_KEY`;
  `buildVerifyEnv(base = process.env)` copies the string entries not
  dropped; `defaultVerifyRunner` passes `env: buildVerifyEnv()`. Argv,
  cwd, signal and result shape unchanged. `src/work/pr.ts` uses the same
  runner, so it gets the same env.
- Not changed: the verify runner does not rewrite `CORVIDINHO_DATA_DIR`
  (the preload owns test isolation); delegate worker env is unchanged.
