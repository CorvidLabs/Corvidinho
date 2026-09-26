---
change: hear-slash-commands-for-session-status-agents-work-discord-4-steal-from-corvid-agent-thin-useful-set-fixture-tests-no
artifact: testing
---

# Testing

- Unit/fixture: command body names include session/status/agents/work.
- Dispatch: unknown command refuse; non-allowlisted channel → not authorized.
- `/session list` empty vs populated; `/session start` creates session + agent call.
- `/status` fields present; `/agents` lists corvidinho; `/work` creates work stub + agent call.
- No live Discord token; allowlists remain default-deny.
- Lane: `fledge lanes run verify --non-interactive` (lint + smoke + test + spec-check).

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-discord-009 | `tests/discord.slash.test.ts` bodies session/status/agents/work; channel gate → not authorized; session list/start; status metrics; agents lists corvidinho; work stub + agent; denied channel creates nothing |

## Automated coverage

- `bun test tests/discord.slash.test.ts`
- `bunx tsc --noEmit`
- `specsync check --spec discord`
- `fledge lanes run verify --non-interactive`
