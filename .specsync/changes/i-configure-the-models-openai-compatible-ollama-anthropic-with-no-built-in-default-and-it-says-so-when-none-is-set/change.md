---
id: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
state: implementing
type: feature
base_commit: 156cfa975c6d269b7e3a183cef3c7fdb20cab4f9
---

# I configure the models (OpenAI-compatible, Ollama, Anthropic) with no built-in default, and it says so when none is set (AGENT-13, AGENT-10)

## Intent

I configure the models (OpenAI-compatible, Ollama, Anthropic) with no built-in default, and it says so when none is set (AGENT-13, AGENT-10)

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`
- `watch`

## Acceptance Criteria

- AGENT-13 (partial: the headless agent CLI kind is providers-2) and AGENT-10 (both already captured on main from Leif's 2026-09-28 interview) hold: CORVIDINHO_LLM_MODEL and the per-tier CORVIDINHO_LLM_MODEL_READ/_TOOL/_CODE take comma lists of kind:model entries (openai, ollama, anthropic; a bare or unknown prefix is OpenAI-compatible) and only the first entry of a tier is called for now; openai uses CORVIDINHO_LLM_BASE_URL (vendor default https://api.openai.com/v1) with CORVIDINHO_LLM_API_KEY or OPENAI_API_KEY, ollama uses OLLAMA_HOST (default 127.0.0.1:11434) with no key and no authorization header, anthropic uses https://api.anthropic.com/v1 with ANTHROPIC_API_KEY, all through the one OpenAI-compatible chat transport and the SAFE-8 guard; there is no built-in default model (gpt-4o-mini removed) and no demo stub: with no usable provider for a run's tier (nothing set, or the kind's key missing) the attempt calls nothing and runTask ends failed with the no-provider notice as its summary on every surface; the notice appears at startup (bridge console warn, daemon llm.no_provider warn plus an llm field on daemon.started, the WATCH poller outside dry runs, task run stderr), in /status (the owner sees the setting names; anyone else sees only that no provider is configured, like the owner-only spend line) and in doctor/init ([warn] llm); ANTHROPIC_API_KEY joins the SAFE-6 secret env scrub (it was already dropped from the verify lane and shells); the bun test preload clears the operator's model config and provider keys; tests that relied on the demo stub or the default model run against a fake provider; tests/agent.providers.test.ts fails on the base sources and passes on the branch

## No-spec Rationale

Not applicable
