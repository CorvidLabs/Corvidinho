---
module: watch
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
---

# Delta — watch (always verify, issue #85)

## Modified

### REQUIREMENT REQ-watch-006

WATCH `createSpawnAgentClient` SHALL spawn via `buildCorvidinhoArgv` so a
`.ts` corvidinho bin is always invoked with `bun` (never posix_spawn alone).
It SHALL NOT pass `--no-verify`: a GitHub-started run that changed files is
held to the project verify lane (AGENT-4 / FLEDGE-2). Fixture tests SHALL
cover argv shape.

Acceptance Criteria
- `.ts` → bun-prefixed argv; binary path unchanged when not `.ts`.
- Spawn argv contains no `--no-verify`.
- No ProcessManager; allowlists unchanged.

### REQUIREMENT REQ-watch-073

The WATCH spawn agent client SHALL run
`task run --task <prompt> --output ndjson` (verify gate on, never
`--no-verify`), read stdout line by
line, forward live state / current tool / token totals to an optional
`onStatus` callback (AGENT-8), and take the summary from the stream's `result`
frame, falling back to `summarizeTaskRunOutput` when no result frame parses.
No new GitHub-visible surface is added.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives the WATCH `onStatus` and returns the result-frame summary.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- Spawn argv is `task run --task <prompt> --output ndjson` (no `--json`, no `--no-verify`).
