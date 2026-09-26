---
id: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
state: archived
type: feature
base_commit: 4ef180b31cf719ac1e1661d209b37360781dd026
---

# Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP)

## Intent

Flesh full LLM tool loop on prove-before-done so task run / Discord / WATCH can call allowlisted plugins via OpenAI-compatible tools (issue #31 dogfood MVP)

## Affected Canonical Specs

- `agent`
- `cli`

## Acceptance Criteria

- When CORVIDINHO_LLM_API_KEY (or OPENAI_API_KEY) is set and tier is tool|code, task run runs an interruptible OpenAI-compatible tool loop over allowlisted plugins; read tier stays chat-only; no key keeps demo stub; AbortSignal stops promptly; SAFE-1 dangerous deny unchanged; prove-before-done still gates when filesChanged reported; fixture tests mock HTTP (no live key); Discord/WATCH keep --no-verify; STATUS DOGFOOD updated; SpecSync + fledge verify green; no #9; no invented ACCESS/bounty/MainNet HI

## No-spec Rationale

Not applicable
