---
change: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
artifact: research
---

# Research

Merlin `docs/book/src/architecture/agent-loop.md` + `crates/merlin-core` tier/tool surface:
Executing loops on ToolUse; verify gate after EndTurn; dangerous tools runtime-gated
(not prompt-gated). Corvidinho already has prove-before-done (`runTask`) and plugin
`runPlugin` SAFE-1 — wire LLM tools onto that rather than inventing a second host.
