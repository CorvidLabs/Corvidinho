---
module: agent
change: fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord
---

# Delta — agent (spawn argv + thin LLM execute)

## Added

### REQUIREMENT REQ-agent-006

The agent module SHALL export `buildCorvidinhoArgv(bin, args)` that returns
`["bun", bin, ...args]` when `bin` ends with `.ts`, else `[bin, ...args]`.
Callers that spawn the Corvidinho entrypoint (protocol handshake, Discord/WATCH
agent clients) SHALL use this helper so `.ts` is never posix_spawned alone.

Acceptance Criteria
- Unit tests cover `.ts` and non-`.ts` argv shapes.

### REQUIREMENT REQ-agent-007

`task run` SHALL use a thin provider-agnostic execute hook: when
`CORVIDINHO_LLM_API_KEY` (or documented fallback such as `OPENAI_API_KEY`) is
set, call an OpenAI-compatible chat completions endpoint
(`CORVIDINHO_LLM_BASE_URL` / `CORVIDINHO_LLM_MODEL`); otherwise keep the demo
execute stub that reports a synthetic file change for the verify-gate exercise.
This SHALL NOT invent a full LLM tool loop (follow-up issue). Secrets SHALL stay
in env; never commit real keys.

Acceptance Criteria
- No API key → demo summary + filesChanged for gate exercise.
- Key present → chat call; summary from assistant text; filesChanged empty (no tool loop).
- Fixture tests cover no-key path; key path may mock fetch (no live API in CI).
