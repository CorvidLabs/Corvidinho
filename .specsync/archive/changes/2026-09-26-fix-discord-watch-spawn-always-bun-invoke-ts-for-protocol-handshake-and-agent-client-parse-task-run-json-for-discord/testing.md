---
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
artifact: testing
---

# Testing

- Unit: `buildCorvidinhoArgv` for `.ts` → bun prefix; binary path unchanged.
- Protocol: live `src/cli.ts` probe via bun returns match (no EACCES).
- summarizeTaskRunOutput: valid JSON → state+summary; garbage → truncated stdout/stderr.
- execute: no key → demo; mocked fetch with key → LLM summary path (no live API in CI).
- `bun test` + `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-006 | `tests/spawn.argv.test.ts` — `.ts` bun prefix / non-`.ts` unchanged |
| REQ-agent-007 | `tests/agent.execute.test.ts` — demo no-key + mocked LLM fetch |
| REQ-cli-007 | `tests/agent.cli.test.ts` — task run --no-verify --json + help |
| REQ-discord-006 | `tests/discord.protocol-version.test.ts` — stub + live `.ts` bun probe match |
| REQ-discord-014 | `tests/spawn.argv.test.ts` + `summarizeTaskRunOutput` cases; discord agent-client uses helper |
| REQ-watch-006 | `src/watch/agent-client.ts` uses `buildCorvidinhoArgv`; argv covered in `tests/spawn.argv.test.ts` |

## Automated coverage

- `bun test tests/spawn.argv.test.ts tests/agent.execute.test.ts tests/discord.protocol-version.test.ts tests/agent.cli.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
