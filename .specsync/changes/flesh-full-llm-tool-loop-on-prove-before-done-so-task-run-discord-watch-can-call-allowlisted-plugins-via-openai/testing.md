---
change: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
|-------------|----------|
| REQ-agent-007 | `tests/agent.execute.test.ts`, `tests/agent.tool-loop.test.ts` demo + key paths |
| REQ-agent-008 | `tests/agent.tool-loop.test.ts` tool loop mock HTTP + abort + SAFE-1 |
| REQ-agent-009 | `tests/agent.tool-loop.test.ts` tier parse/filter + read-tier no tools |
| REQ-cli-007 | `src/cli.ts` task run + `tests/agent.execute.test.ts` / help documents LLM path |
| REQ-cli-009 | CLI help documents `--tier`; task run wires createTaskExecute with tier |

## Commands

```
bun test tests/agent.tool-loop.test.ts tests/agent.execute.test.ts
bunx tsc --noEmit
specsync check --spec agent --spec cli
fledge lanes run verify --non-interactive
```
