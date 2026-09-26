---
change: discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-014 / REQ-discord-085 | `tests/agent.ndjson-spawn.test.ts` Discord argv has no `--no-verify` |
| REQ-watch-006 / REQ-watch-085 | `tests/agent.ndjson-spawn.test.ts` WATCH argv has no `--no-verify` |
| REQ-cli-007 / REQ-cli-085 | `tests/agent.cli.test.ts` — CLI `--no-verify` still works locally; bridges omit it |
| AGENT-4 empty-diff skip | Existing `tests/agent.loop.test.ts` |
| Package 0.0.13 | `tests/version.test.ts` / `tests/update-helpers.test.ts` |

## Automated coverage

- `bun test tests/agent.ndjson-spawn.test.ts tests/spawn.argv.test.ts tests/agent.cli.test.ts tests/version.test.ts tests/update-helpers.test.ts`
- `fledge lanes run verify --non-interactive`
