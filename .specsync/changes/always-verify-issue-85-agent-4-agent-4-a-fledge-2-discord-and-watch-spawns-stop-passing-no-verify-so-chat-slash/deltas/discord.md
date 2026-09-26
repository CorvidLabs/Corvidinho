---
module: discord
change: always-verify-issue-85-agent-4-agent-4-a-fledge-2-discord-and-watch-spawns-stop-passing-no-verify-so-chat-slash
---

# Delta — discord (always verify, issue #85)

## Added

### REQUIREMENT REQ-discord-085

Every Discord-started agent run — @mention / reply / thread chat,
`/session start`, `/work`, and schedule ticks — SHALL spawn `task run` without
`--no-verify`, so a run that changed files is held to the project verify lane
(AGENT-4 / FLEDGE-2). When a run fails, the mention reply, the `/session start`
and `/work` replies, and the schedule post SHALL say `failed (exit N)` and,
when the verify lane failed, the plain `Verification FAILED: … — not done.`
line rebuilt from its fixed template (never model or lane text), instead of
only an exit code.

Acceptance Criteria
- Fake-bin fixture: Discord spawn argv is `task run --task <prompt> --output ndjson` with no `--no-verify`.
- A failed schedule run whose summary carries the FAILED line posts `failed (exit 1)` followed by that line.
- A failure without the line stays `failed (exit N)`.

## Modified

### REQUIREMENT REQ-discord-001

The system SHALL start a session stub with a stable session id when the bot is @mentioned in an allowlisted channel (DISCORD-1). The stub MAY spawn `corvidinho task run` with the verify gate on (never `--no-verify`, REQ-discord-085) or echo; it SHALL NOT port ProcessManager.

Acceptance Criteria
- `routeMessage` on mention in allowed channel returns `kind: "start_session"` with new session id.
- Session stub recorded in SessionStore; no ProcessManager.

### REQUIREMENT REQ-discord-014

Discord/WATCH spawn agent clients SHALL build subprocess argv with
`buildCorvidinhoArgv` so `.ts` entrypoints always run under `bun`. When
`task run --json` stdout is present, the Discord chat reply SHALL surface a
parsed summary (state / verified / attempts + `result.summary`) rather than
dumping raw JSON. Bridge spawns SHALL NOT pass `--no-verify`
(REQ-discord-085). Fixture tests SHALL cover argv shape and JSON summary
parsing without a live Discord token.

Acceptance Criteria
- `.ts` bin → `["bun", bin, "task", "run", ...]`; non-`.ts` → `[bin, ...]`.
- Valid `--json` stdout → Discord body includes state and summary text.
- Unparseable stdout falls back to truncated stdout/stderr.
- No ProcessManager; allowlists unchanged; secrets out of repo.

### REQUIREMENT REQ-discord-073

The Discord spawn agent client SHALL run
`task run --task <prompt> --output ndjson` (verify gate on, never
`--no-verify`), read stdout line by
line while the child runs, and forward each frame's live state, current tool,
and token counts to `onStatus` so the thinking embed shows what the agent is
doing (AGENT-8 / DISCORD-3). The reply summary SHALL come from the stream's
`result` frame; when no result frame parses, the client SHALL fall back to
`summarizeTaskRunOutput` over the non-frame stdout, stderr and exit code.
Frame-shaped lines that do not match the bridge's protocol (or are malformed)
SHALL never become reply text; when the binary streamed another protocol and
no result frame parsed, the reply SHALL be a protocol-mismatch notice naming
both versions.
Token counts SHALL be the provider-reported running total when a `usage`
frame arrived, else the existing rough estimate from the summary length.
Because the bridge now depends on the stream, `CORVIDINHO_PROTOCOL_VERSION`
SHALL be `2` and DISCORD-10 lockstep SHALL refuse a binary reporting another
version.

Acceptance Criteria
- Fake-bin fixture printing ndjson drives `onStatus` with planning / tool / token updates in order.
- Summary equals `summarizeTaskResult` of the result frame; garbage lines and stderr do not break parsing.
- Missing result frame falls back to `summarizeTaskRunOutput`.
- A protocol-3 frame's tool output never reaches the reply; the reply is the protocol-mismatch notice.
- Spawn argv is `task run --task <prompt> --output ndjson` (no `--json`, no `--no-verify`).
- `checkProtocolVersion` treats a protocol-1 binary as a mismatch; `--protocol-version` prints 2.
