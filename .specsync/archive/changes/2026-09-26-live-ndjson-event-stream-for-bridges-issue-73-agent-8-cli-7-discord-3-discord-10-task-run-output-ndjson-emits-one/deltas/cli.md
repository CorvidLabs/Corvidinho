---
module: cli
change: live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one
---

# Delta — cli (task run --output, issue #73)

## Added

### REQUIREMENT REQ-cli-073

`corvidinho task run` SHALL accept `--output text|json|ndjson` so output can be
human text, a single JSON result, or a stream of events (CLI-7). `--json`
SHALL remain an alias for `--output json` and its single pretty-printed
`{ result, events }` payload SHALL be unchanged. `--output ndjson` SHALL write
one JSON object per stdout line as the run progresses (AgentEvent frames,
`usage` frames when the provider reports usage) and end with a `result` frame
whose `result` equals the `--json` `result`, except that `summary` is capped at
4000 characters (the frame then carries `truncated: true`) so one line stays
bounded; human stderr progress stays quiet
in ndjson mode like `--json`. Exit codes SHALL match the other modes. An
unknown `--output` value SHALL print usage to stderr and exit 1.
`--protocol-version` SHALL print `2`.

Acceptance Criteria
- `task run --no-verify --output ndjson` prints only protocol-2 frames, starting with `StateChanged` and ending with `result`.
- The ndjson `result` equals `task run --no-verify --json` `.result` (a `summary` over 4000 chars is capped with `truncated: true`).
- `--json` output still parses as one JSON document with `result` and `events`.
- `--output bogus` exits 1 with a usage line.
- `--protocol-version` prints `2`.

## Modified

### REQUIREMENT REQ-cli-008

The CLI SHALL expose `discord bridge` to start the HEAR bridge,
`discord register-commands` to full-overwrite Discord application commands
(REQ-discord-016), and `--protocol-version` printing the wire protocol integer.
Doctor SHALL note Discord token and allowlist go-live requirements without
printing secret values. Help SHALL document `DISCORD_GUILD_ID` preference for
fast guild-scoped registration.

Acceptance Criteria
- `corvidinho --protocol-version` prints `CORVIDINHO_PROTOCOL_VERSION` (currently `2`) and exits 0.
- `corvidinho discord bridge` without token exits non-zero with clean explanation.
- `corvidinho discord register-commands` without token exits non-zero naming token env.
- Help documents `discord bridge`, `discord register-commands`, and Discord env/allowlist vars including `DISCORD_GUILD_ID`.
