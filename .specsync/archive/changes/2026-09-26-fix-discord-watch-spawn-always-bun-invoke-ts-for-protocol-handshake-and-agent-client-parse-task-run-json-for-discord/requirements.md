---
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
artifact: requirements
---

# Requirements

1. Shared `buildCorvidinhoArgv(bin, args)`: `.ts` bins always become `["bun", bin, ...args]`; never spawn `.ts` alone.
2. `checkProtocolVersion` / `enforceProtocolVersionOrExit` and discord + watch `createSpawnAgentClient` MUST use that helper.
3. Fixture tests assert argv shape for `.ts` and non-`.ts` bins.
4. Discord chat path parses `task run --json` stdout into a short useful summary (state + result.summary).
5. Thin env-gated execute: when `CORVIDINHO_LLM_API_KEY` (or documented fallbacks) is set, call an OpenAI-compatible chat endpoint; else keep demo execute. No full tool loop in this change.
6. `.env.example` documents `CORVIDINHO_LLM_*` / related keys with no real secrets.
7. STATUS.md: Discord go-live on box done; remaining LLM gap + follow-up issue.
