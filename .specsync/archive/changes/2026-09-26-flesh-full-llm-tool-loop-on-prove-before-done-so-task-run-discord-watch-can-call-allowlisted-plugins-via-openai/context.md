---
change: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
artifact: context
---

# Context

STATUS DOGFOOD gap and issue #31: Discord HEAR is live on Leif's box, prove-before-done (#17)
and thin env-gated chat execute (#32) landed, but `task run` still could not call plugins via
an LLM — only a single chat-completions summary stub.

Steal Merlin agent-loop Executing↔ToolUse pattern thinly: OpenAI-compatible tools mapped from
the in-process plugin registry, interruptible rounds, capability tier (AGENT-5), SAFE-1 deny
unchanged. Do not invent ACCESS/bounty/MainNet HI; do not touch #9; Discord/WATCH keep
`--no-verify` for latency.
