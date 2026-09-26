---
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
artifact: design
---

# Design

- New `src/agent/spawn-argv.ts`: `buildCorvidinhoArgv`.
- Wire into `src/discord/protocol-version.ts`, `src/discord/agent-client.ts`, `src/watch/agent-client.ts`.
- New `src/agent/task-summary.ts` (`summarizeTaskRunOutput`) for JSON parse → Discord body.
- New `src/agent/execute.ts`: `createTaskExecute` / `loadLlmEnv` — env-gated; demo fallback preserves verify-gate exercise when no key.
- CLI `taskRun` uses `createTaskExecute` instead of inline demo.
- Follow-up GitHub issue (dogfood label) for full LLM tool loop (AGENT-3/5 flesh).
