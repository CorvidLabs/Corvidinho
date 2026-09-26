---
module: discord
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
---

# Delta — discord (bun spawn + JSON summary)

## Modified

### REQUIREMENT REQ-discord-006

The bridge SHALL check wire protocol version against
`corvidinho --protocol-version` via Merlin-shaped `protocol-version.ts`
(DISCORD-10): hard-fail on a verifiable mismatch; soft-continue if
unverifiable. When the configured bin path ends in `.ts`, the probe SHALL
invoke via `bun` (never posix_spawn the `.ts` path alone — EACCES). Archive
`shared/bridge-protocol.ts` SHALL NOT be used.

Acceptance Criteria
- `corvidinho --protocol-version` prints `1`.
- Verifiable mismatch refuses start; unverifiable warns and continues.
- Fixture stub-binary tests cover match/mismatch/unverifiable/timeout.
- `.ts` bin probe uses argv starting with `bun` then the `.ts` path.

## Added

### REQUIREMENT REQ-discord-014

Discord/WATCH spawn agent clients SHALL build subprocess argv with
`buildCorvidinhoArgv` so `.ts` entrypoints always run under `bun`. When
`task run --json` stdout is present, the Discord chat reply SHALL surface a
parsed summary (state / verified / attempts + `result.summary`) rather than
dumping raw JSON. Prefer `--no-verify` for bridge latency. Fixture tests SHALL
cover argv shape and JSON summary parsing without a live Discord token.

Acceptance Criteria
- `.ts` bin → `["bun", bin, "task", "run", ...]`; non-`.ts` → `[bin, ...]`.
- Valid `--json` stdout → Discord body includes state and summary text.
- Unparseable stdout falls back to truncated stdout/stderr.
- No ProcessManager; allowlists unchanged; secrets out of repo.
