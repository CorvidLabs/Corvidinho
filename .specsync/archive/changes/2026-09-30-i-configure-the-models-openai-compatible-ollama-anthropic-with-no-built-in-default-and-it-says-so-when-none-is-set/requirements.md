---
change: i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set
artifact: requirements
---

# Requirements

- AGENT-13 (captured, `hi/agent.md`, Leif 2026-09-28 round 2): "I configure
  its models (OpenAI-compatible, Ollama, Anthropic or a headless agent CLI),
  and there's no built-in default." Partial here: the headless agent CLI kind
  is providers-2.
- AGENT-10 (captured, `hi/agent.md`, Leif 2026-09-28 round 2): "With no
  provider set, it says so at startup and in /status."
- Nothing new captured with `hi` in this change.
- Kept: AGENT-5 / REQ-agent-079 (per-tier models), SAFE-8 / SAFE-14.a (the
  spend guard prices every call; spend details owner-only), SAFE-6 (keys
  never printed), AGENT-4/8 (a provider failure is a failed run), DISCORD-15.a
  (the footer shows the configured model; "" is omitted).
- Added: REQ-agent-179 (providers, no default, the notice, no-provider runs
  fail, `ANTHROPIC_API_KEY` scrub), REQ-cli-079 (`task run` and daemon
  startup lines, help and docs), REQ-discord-079 (bridge startup line),
  REQ-watch-079 (WATCH startup line).
- Modified: REQ-agent-007, REQ-agent-015, REQ-agent-079, REQ-agent-085,
  REQ-agent-260, REQ-cli-003, REQ-cli-006, REQ-cli-007, REQ-cli-098,
  REQ-cli-262, REQ-cli-505, REQ-discord-015.
- New env read: `OLLAMA_HOST` (ollama kind), `ANTHROPIC_API_KEY` (anthropic
  kind). No new setting of Corvidinho's own, schema version, slash command,
  CLI flag or /admin knob.
