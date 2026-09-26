---
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
artifact: context
---

# Context

Live Discord HEAR on Leif's box (corvid-agent#1110) logged:
`couldn't verify protocol version (spawn failed: EACCES: permission denied, posix_spawn '.../src/cli.ts')`
then soft-continued. Root cause: `checkProtocolVersion` / `Bun.spawn([bin, ...])` when
`CORVIDINHO_BIN` defaults to `src/cli.ts` tries to posix_spawn the `.ts` path alone.
`task run` from Discord is still demo-execute only — dogfood needs reliable spawn + a
useful `--json` summary back to Discord; full LLM tool loop is a follow-up issue.

Constraints: HI-first (no invent ACCESS/bounty/MainNet); do not touch #9; do not weaken
allowlists; secrets never in repo; prefer `--no-verify` for bridge latency.
