---
change: planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened
artifact: context
---

# Context

Adversarial review of PR #202 (Planning SpecSync briefing reaches the model,
REQ-agent-004). That PR made the Planning briefing part of the LLM user
message on every attempt. Planning picks modules by token overlap with the
whole task text, and the bridges wrap the human's request in context:

- Discord: the memory block (`[Corvidinho memory for this Discord user …]`)
  and the identity block (`[Corvidinho acting Discord user …]`,
  `- discord_user_id: …`) are prepended to every chat.
- WATCH: every run starts with `[WATCH <kind>] <repo>#<n> by @<sender>`.

In this repository (modules agent, cli, discord, plugins, watch) that meant a
Discord "hi there" selected `discord` and every WATCH run selected `watch`.
Before PR #202 this only showed in the Planning Text event; after it, every
Discord chat and WATCH run sent about 8000 extra characters of an unrelated
spec to the model, on every tool round and every attempt.

Two smaller gaps in the same PR: the fence escape only matched the exact
`</specsync-briefing` form (`</ specsync-briefing >` still reads as a close
tag), and the 8000-char cut could end on the high half of a surrogate pair,
which puts a lone surrogate (not valid Unicode) in the request body.

Constraints: no new env var, flag, event type or product surface; the fix
stays inside the agent module. Captured HI: AGENT-2, SPECSYNC-1/5, SAFE-6.
