---
id: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
state: archived
type: bug_fix
base_commit: a8068ad5073cb7401518f9f996b988db9740f00c
---

# Fix Discord/WATCH spawn: always bun-invoke .ts for protocol handshake and agent-client; parse task run --json for Discord summary; thin env-gated LLM execute stub; STATUS dogfood go-live note

## Intent

Fix Discord/WATCH spawn: always bun-invoke .ts for protocol handshake and agent-client; parse task run --json for Discord summary; thin env-gated LLM execute stub; STATUS dogfood go-live note

## Affected Canonical Specs

- `discord`
- `watch`
- `agent`
- `cli`

## Acceptance Criteria

- buildCorvidinhoArgv always prefixes bun for .ts bins; protocol-version + discord/watch createSpawnAgentClient use it (no EACCES posix_spawn of .ts alone); fixture tests assert spawn argv shape; Discord surfaces parsed task run --json summary (state/summary) not raw dump; thin env-gated LLM execute when CORVIDINHO_LLM_API_KEY set else demo stub; .env.example documents CORVIDINHO_LLM_* without secrets; STATUS notes Discord go-live done + LLM gap/issue; SpecSync + fledge verify green; no #9; allowlists unchanged

## No-spec Rationale

Not applicable
