---
change: per-tier-model-read-tool-code-runs-call-the-model-configured-for-that-tier-agent-5
artifact: context
---

# Context

Captured HI: **AGENT-5** (`hi/agent.md`): "I can pick a provider and a
capability tier so cheap models stay on read-shaped work and expensive ones are
used when tools and code are required." Issues #79 / #80.

On main (fc0ed8d) the tier already decides the tool catalog (REQ-agent-009,
REQ-agent-128) and delegate / council refuse below code tier, but the tier does
not choose the model: `loadLlmEnv` read one `CORVIDINHO_LLM_MODEL` (default
`gpt-4o-mini`) for every tier, and `run()` spread `{ ...llm, tier }` after the
`--tier` override, so a read-tier run and a code-tier run always called the same
model. Delegate workers and council voices (read tier by default) inherit the
lead's env, so they called the lead's model too. Repro on main:
`createTaskExecute` with `CORVIDINHO_LLM_MODEL=big` and a fetch stub recording
`body.model` sends `big` at tier read and at tier code; no config makes them
differ.

Constraints: no new slash command, bridge surface or config file; no SQLite
schema change; endpoint and key stay shared (per-tier endpoint is a follow-up
question for Leif). Out of scope (drafts in #79 / #80, not captured): native
Ollama / Anthropic / headless-CLI adapters, removing the `gpt-4o-mini` default,
a no-provider startup warning, fallback chains, idle timeout, turn cap. Draft
"AGENT-9" in #79 collides with captured AGENT-9 (tool-round soft-land).
Multi-model councils (draft AUTONOMOUS-11) are not implemented: all voices at
one tier still share that tier's model.
