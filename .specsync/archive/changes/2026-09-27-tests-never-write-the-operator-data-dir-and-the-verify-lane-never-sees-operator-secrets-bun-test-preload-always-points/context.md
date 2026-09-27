---
change: tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points
artifact: context
---

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
