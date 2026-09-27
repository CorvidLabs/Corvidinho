---
change: tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points
artifact: tasks
---

# Tasks

- [x] Reproduce on main (642a843): `CORVIDINHO_DATA_DIR=$T bun test` leaves 314 audit rows in `$T`; `task run` with the verify lane adds more.
- [x] Regression tests written first and failing on main: preload probe (3/4 cases fail) and verify-env spawn case (`DISCORD_TOKEN` reaches fledge).
- [x] Preload always points `CORVIDINHO_DATA_DIR` at its own temp dir; unsets `CORVIDINHO_AUDIT_HMAC_KEY`, `CORVIDINHO_WATCH_SPAWN_LOG`, `WORKTREE_BASE_DIR`.
- [x] Preload defaults `env` to the current `process.env` for `Bun.spawn` / `Bun.spawnSync` without one (found: spawned CLIs still wrote the operator dir).
- [x] Verify runner spawns fledge with `buildVerifyEnv()` (worker drop list from delegate.ts + LLM API keys).
- [x] Spec files lists (cli: preload + new test + probe; agent: verify-env test), Public API / Invariants lines, deltas REQ-cli-262 (Added) and REQ-agent-002 (Modified).
- [x] Full suite with operator vars set leaves the operator dir empty; `task run` with verify leaves it empty.
- [x] tsc, bun test, SpecSync checks and `fledge lanes run verify --non-interactive`.
