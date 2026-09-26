---
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-044 | `tests/agent.ask.test.ts`: argument parsing / refusal / cap; catalog dedup; mock-HTTP tool loop ends on ask-human without running a plugin; empty ask refused and loop continues; read tier sends no tools; runTask blocked (no verify, never done) and verify exhaustion failed + stuck ask; NDJSON blocked state + result ask round-trip; CLI `task run --json` / text against a localhost mock LLM (state blocked, exit 0, question printed) |
| REQ-discord-044 | `tests/discord.ask-ping.test.ts`: formatAskReply (owner on first line, no owner means no mention, stuck context, scrub + defang + length cap); bridge mention path with clarify / stuck / no-owner / ordinary runs (fake gateway, temp project root); spawn client reads and validates `result.ask` from a fake sh bin; scheduler tick posts question + owner mention; schedule ping dedupe (same question pings once and repeats post unpinged and unwarned, changed question/reason pings again, failed run keeps the marker, clean run and pause/resume re-arm, SQLite marker survives a restart / second ticker, no owner records no marker, digest shape, schema v7 migration from v6); `tests/watch.session-store.durable.test.ts` schema version assertions follow v7 |

## Automated coverage

- `bun test tests/agent.ask.test.ts tests/discord.ask-ping.test.ts`
- `bun test` (full suite), `bunx tsc --noEmit`
- `specsync check --require-coverage 100`
- `fledge lanes run verify --non-interactive`
