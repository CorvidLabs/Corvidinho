---
change: tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points
artifact: testing
---

# Testing

Before = origin/main 642a843; after = this change. Operator env in the
end-to-end runs: `CORVIDINHO_DATA_DIR=$T` (fresh temp dir),
`CORVIDINHO_AUDIT_HMAC_KEY` set, and for the suite run also
`CORVIDINHO_WATCH_SPAWN_LOG=$T/...`, `WORKTREE_BASE_DIR=$T/...`.

- `CORVIDINHO_DATA_DIR=$T bun test`: before 314 `audit_log` rows in `$T`
  (72 shell-exec, 55 git-push, 48 git-commit, 27 github-issue-create, ...);
  with only the `process.env` part of the preload fix, 1 keyed `danger-ping`
  row (a CLI spawned with `Bun.spawn` and no `env`); after, `$T` is empty and
  the suite passes (1321 pass, 0 fail).
- `bun src/cli.ts task run --task "touch agent loop" --json` (demo execute,
  real `defaultVerifyRunner` → `fledge lanes run verify --non-interactive`):
  before 314 rows in `$T`, all 314 keyed with the operator key,
  `verified: true`; after `$T` is empty, `verified: true`, state done.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` "child bun test with an operator CORVIDINHO_DATA_DIR leaves 0 audit rows there" (probe `tests/fixtures/preload-probe.ts`) | Child `bun test` with the operator's data dir, key, spawn log and worktree base writes its row and a spawned CLI's denied row (exit 2) to the preload temp dir (2 rows there); 0 audit rows and no file in the operator dir. Fails before (probe data dir is the operator dir). |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` "an existing operator DB keeps its audit chain; the operator key signs nothing" | Operator DB seeded with 1 keyed row keeps count 1 and the same last hash after the child run; probe sees no audit key and its rows have `keyed = 0`. Fails before (row count and hash change). |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` "children spawned without an explicit env get the test data dir, not the operator's" | `Bun.spawn(argv)`, `Bun.spawn({ cmd })`, `Bun.spawnSync(argv)` with no `env` see the preload's data dir and no audit key / spawn log / worktree base. Fails with only the `process.env` fix (children see the operator's values). |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` "operator WATCH spawn log and worktree base are not inherited" | Probe's `defaultSpawnLogPath()` is outside the operator dir and `WORKTREE_BASE_DIR` is unset. Fails before. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` "bot run settings (non-interactive, spend cap, LLM keys) do not reach the suite" | Child `bun test` started with `CORVIDINHO_NON_INTERACTIVE=1`, `FLEDGE_NON_INTERACTIVE=1`, `CORVIDINHO_DAILY_SPEND_CAP_USD=5` and both LLM API keys sees none of them, `isNonInteractive({})` is false and `loadLlmEnv().apiKey` is unset. Fails before (all five keys reach the suite). Review repro before: with `CORVIDINHO_NON_INTERACTIVE=1` (set by every Discord / WATCH / daemon task run, inherited by its verify lane) `bun test` fails the GITHUB-6 CLI deny-list case; with `CORVIDINHO_DAILY_SPEND_CAP_USD=5` it fails 2 `agent.ask` mock-LLM cases; with `CORVIDINHO_LLM_API_KEY` set the `task run --no-verify` CLI case calls the provider. After: a full run with a bot-like env (those keys plus Discord / GitHub / owner / allowlist / LLM settings) passes. |
| `REQ-cli-262` | full `bun test` with operator vars set | Operator dir empty after the run (before: 314 rows); 1321 pass, 0 fail. |
| `REQ-agent-002` | `tests/agent.verify-env.test.ts` "defaultVerifyRunner spawns fledge without operator secrets" | A process with `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `CORVIDINHO_LLM_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY` and `CORVIDINHO_ACTING_*` runs the default runner against a fake `fledge` that prints argv + env: argv is `lanes run verify --non-interactive`, none of those keys or values appear, a marker key is kept. Fails before (`DISCORD_TOKEN` present). |
| `REQ-agent-002` | `tests/agent.verify-env.test.ts` "isVerifyEnvDropped …", "buildVerifyEnv …" | Drop list = worker drop list + LLM API keys; PATH, HOME, `CORVIDINHO_DATA_DIR`, `CORVIDINHO_LLM_BASE_URL` / `_MODEL` and other keys are kept. |
| `REQ-agent-002` | `tests/agent.loop.test.ts` | Existing verify retry / exhaustion / argv-shape cases unchanged and passing. |
| `REQ-agent-117` | `tests/autonomous.delegate.test.ts` | Worker env drop list (reused, not changed) still keeps LLM keys; passing. |
