---
module: discord
change: discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still
---

# Delta — discord (always verify spawn)

## Modified

### REQUIREMENT REQ-discord-014

Discord/WATCH spawn agent clients SHALL build subprocess argv with
`buildCorvidinhoArgv` so `.ts` entrypoints always run under `bun`. When
`task run` stdout is present (ndjson result frame or legacy `--json`), the
Discord chat reply SHALL surface a parsed summary (state / verified /
attempts + summary) rather than dumping raw JSON. Spawns SHALL NOT pass
`--no-verify` — prove-before-done (AGENT-4 / FLEDGE-2) is the default; the
agent loop still skips the verify lane when `filesChanged` is empty so plain
chat stays fast. Fixture tests SHALL cover argv shape and summary parsing
without a live Discord token.

Acceptance Criteria
- `.ts` bin → `["bun", "--no-env-file", bin, "task", "run", ...]`; non-`.ts` → `[bin, ...]`.
- Spawn argv for Discord chat is `task run --task <prompt> --output ndjson` with **no** `--no-verify`.
- Valid result/json stdout → Discord body includes state and summary text.
- Unparseable stdout falls back to truncated stdout/stderr.
- No ProcessManager; allowlists unchanged; secrets out of repo.

## Added

### REQUIREMENT REQ-discord-085

Discord `createSpawnAgentClient` SHALL always hold chat/schedule runs to the
prove-before-done gate (AGENT-4 / FLEDGE-2 / issue #85 captured slice): spawn
argv MUST NOT include `--no-verify`. Empty `filesChanged` continues to skip
verify inside the agent loop (honest `verifySkipped`); when tools report file
changes, `fledge lanes run verify` runs before done. Draft AGENT-14/15 are out
of scope. Package version SHALL bump to **0.0.13**. Fixture tests without live
Discord.

Acceptance Criteria
- Discord spawn argv never includes `--no-verify`.
- Package `0.0.13`; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.
