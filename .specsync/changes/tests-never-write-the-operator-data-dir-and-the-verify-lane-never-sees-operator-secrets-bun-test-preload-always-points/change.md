---
id: tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points
state: approved
type: bug_fix
base_commit: 642a843e0dee50df6cb9376f9e772dd28688ca2f
---

# Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6)

## Intent

Tests never write the operator data dir and the verify lane never sees operator secrets: bun test preload always points CORVIDINHO_DATA_DIR at its own temp dir and clears CORVIDINHO_AUDIT_HMAC_KEY / CORVIDINHO_WATCH_SPAWN_LOG / WORKTREE_BASE_DIR; the fledge verify runner spawns with DISCORD_*, GitHub tokens, LLM API keys, the audit key and CORVIDINHO_ACTING_* stripped (SAFE-5 / SAFE-6)

## Affected Canonical Specs

- `cli`
- `agent`

## Acceptance Criteria

- With the operator's CORVIDINHO_DATA_DIR, CORVIDINHO_AUDIT_HMAC_KEY, CORVIDINHO_WATCH_SPAWN_LOG and WORKTREE_BASE_DIR set, bun test (and the fledge verify lane that runs it) writes nothing to the operator data dir: 0 audit rows land there, an existing operator audit chain is unchanged, no test row is keyed with the operator key, and children spawned without an explicit env get the test data dir; the default verify runner spawns fledge without DISCORD_*, GITHUB_TOKEN, GH_TOKEN, CORVIDINHO_LLM_API_KEY, OPENAI_API_KEY, CORVIDINHO_AUDIT_HMAC_KEY or CORVIDINHO_ACTING_* while keeping the rest of the env (SAFE-5 / SAFE-6)

## No-spec Rationale

Not applicable
