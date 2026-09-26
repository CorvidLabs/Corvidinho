---
change: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
artifact: testing
---

# Testing

## Local gates

- `bun test` (agent loop unit + CLI smoke)
- `bunx tsc --noEmit`
- `bun src/cli.ts task run --no-verify --json`
- `specsync check`
- `specsync change audit`
- `fledge lanes run verify --non-interactive`

## CI

- **ci** Bun install/test/typecheck (no Fledge)
- **Spec Sync** CorvidLabs/spec-sync@v6 + change audit

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-agent-001 | `tests/agent.loop.test.ts` state sequence |
| REQ-agent-002 | `tests/agent.loop.test.ts` fail→retry→pass / exhausted |
| REQ-agent-003 | `tests/agent.loop.test.ts` --no-verify skip + abort |
| REQ-cli-005 | `tests/agent.cli.test.ts` task run smoke |
