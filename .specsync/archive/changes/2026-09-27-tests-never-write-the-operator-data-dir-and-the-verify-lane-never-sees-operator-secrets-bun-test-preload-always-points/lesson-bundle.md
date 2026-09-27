# Lesson bundle — tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6)
- **Kind**: BugFix
- **Specs**: cli, agent
- **Paths**: tests/preload.ts, src/agent/verify.ts, tests/preload.operator-data-dir.test.ts, tests/fixtures/preload-probe.ts, tests/agent.verify-env.test.ts, specs/agent/agent.spec.md, specs/cli/cli.spec.md
- **Acceptance**: With the operator's CORVIDINHO_DATA_DIR, CORVIDINHO_AUDIT_HMAC_KEY, CORVIDINHO_WATCH_SPAWN_LOG and WORKTREE_BASE_DIR set, bun test (and the fledge verify lane that runs it) writes nothing to the operator data dir: 0 audit rows land there, an existing operator audit chain is unchanged, no test row is keyed with the operator key, and children spawned without an explicit env get the test data dir; the default verify runner spawns fledge without DISCORD_*, GITHUB_TOKEN, GH_TOKEN, CORVIDINHO_LLM_API_KEY, OPENAI_API_KEY, CORVIDINHO_AUDIT_HMAC_KEY or CORVIDINHO_ACTING_* while keeping the rest of the env (SAFE-5 / SAFE-6)

## Evidence

- Verification commit: `6ef5aeb8cb7f02d31e46d70b47881e903832c361`
- Base commit: `642a843e0dee50df6cb9376f9e772dd28688ca2f`
- Verified by: `specsync check --spec agent --spec cli`

## From the change's context.md

# Context

An end-to-end check of origin/main found that every prove-before-done verify
run (Discord, WATCH, daemon, CLI `task run`) runs the test suite against the
operator's data dir. `tests/preload.ts` only set `CORVIDINHO_DATA_DIR` when it
was unset, and `src/agent/verify.ts` spawned fledge with the parent's full
env, so the bot's own `CORVIDINHO_DATA_DIR` reached `bun test`.

Repro on 642a843: `CORVIDINHO_DATA_DIR=$T bun test` left 314 fake
`audit_log` rows in `$T/corvidinho.db` (72 shell-exec, 55 git-push, 48
git-commit, 27 github-issue-create, 23 git-branch-create, ...). With
`CORVIDINHO_AUDIT_HMAC_KEY` set the fake rows are keyed with the operator's
key, so they are indistinguishable from real ones (SAFE-5). The same verify
lane also handed agent-written tests `DISCORD_TOKEN`, GitHub tokens, LLM API
keys and the audit key (SAFE-6, AGENTS.md secrets rule).

Found while fixing: in Bun 1.4.2 `Bun.spawn` / `Bun.spawnSync` with no `env`
option pass the environment the process started with, not `process.env` as
the preload edits it (`node:child_process` does use `process.env`). So
forcing `process.env.CORVIDINHO_DATA_DIR` alone still let
`tests/plugins.deny.cli.test.ts` (spawns `bun src/cli.ts` without `env`)
write one keyed `danger-ping` row into the operator dir. The preload
therefore also defaults `env` for those spawns.

HI: SAFE-5 (audit trail integrity), SAFE-6 (secrets out of logs); AGENTS.md
secrets rule. No new product surface.

## From the change's design.md

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

## From the change's testing.md

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
| `REQ-agent-002` | `tests/agent.verify-env.test.ts` "defaultVerifyRunner spawns fledge without operator secrets" | A process with `DISCORD_TOKEN`, `DISCORD_BOT_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` (review: the vendor keys the Fledge plugin child env already drops), `CORVIDINHO_LLM_API_KEY`, `CORVIDINHO_AUDIT_HMAC_KEY` and `CORVIDINHO_ACTING_*` runs the default runner against a fake `fledge` that prints argv + env: argv is `lanes run verify --non-interactive`, none of those keys or values appear, a marker key is kept. Fails before (`DISCORD_TOKEN` present). |
| `REQ-agent-002` | `tests/agent.verify-env.test.ts` "isVerifyEnvDropped …", "buildVerifyEnv …" | Drop list = worker drop list + LLM API keys; PATH, HOME, `CORVIDINHO_DATA_DIR`, `CORVIDINHO_LLM_BASE_URL` / `_MODEL` and other keys are kept. |
| `REQ-agent-002` | `tests/agent.loop.test.ts` | Existing verify retry / exhaustion / argv-shape cases unchanged and passing. |
| `REQ-agent-117` | `tests/autonomous.delegate.test.ts` | Worker env drop list (reused, not changed) still keeps LLM keys; passing. |

## Where these lessons go

- `specs/cli/context.md`
- `specs/agent/context.md`
