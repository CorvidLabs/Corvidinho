---
module: watch
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
---

# Delta: watch (github watch says at start when no provider is set — AGENT-10)

## Added

### REQUIREMENT REQ-watch-079

With no provider set, it says so at startup (AGENT-10, captured from Leif's
2026-09-28 interview). Outside a dry run, `startWatchPoller` SHALL log one
`[watch] <notice>` line at start when any tier has no usable model provider
(`providerNotice(env)`, REQ-agent-179), and nothing when every tier has one.
A dry run echoes and calls no model, so it SHALL NOT print the notice. WATCH
runs on a tier with no provider fail with the notice as their summary
(REQ-agent-179). No new env var, config key or GitHub-visible surface.

Acceptance Criteria
- A non-dry-run poller with an injected agent and no model logs `[watch] No model provider is configured: CORVIDINHO_LLM_MODEL is not set. …`; with `CORVIDINHO_LLM_MODEL=ollama:qwen3`, or in a dry run, no no-provider line.
