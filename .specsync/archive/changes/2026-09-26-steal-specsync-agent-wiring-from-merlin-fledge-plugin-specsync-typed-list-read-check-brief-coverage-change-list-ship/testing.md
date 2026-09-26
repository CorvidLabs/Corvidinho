---
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
artifact: testing
---

# Testing

## Local gates

- `bun test` (specLoader + SpecSync plugins + Planning briefing + existing suites)
- `bunx tsc --noEmit`
- `bun src/cli.ts specsync list`
- `bun src/cli.ts task run --task "agent loop" --no-verify --json`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive` (includes spec-check)

## CI

- **ci** Bun install/test/typecheck (no Fledge)
- **Spec Sync** CorvidLabs/spec-sync@v6 + change audit

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-004 | `tests/agent.loop.test.ts` Planning SpecSync briefing; `tests/specLoader.test.ts` |
| REQ-agent-005 | `tests/agent.loop.test.ts` fledge.toml verify lane includes spec-check |
| REQ-plugins-008 | `tests/specsync.plugins.test.ts` list/read/brief + plugins list names |
| REQ-cli-007 | `tests/specsync.plugins.test.ts` CLI list/read/help; task --task via agent loop test |
