---
module: agent
change: private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation
---

# Delta — agent (the tool loop keeps private text from the model)

## Added

### REQUIREMENT REQ-agent-710

The tool loop keeps text shown only privately away from the model
(MEMORY-7.a, #101). When an offered tool's result is `ok` and carries a
non-blank `privateText` (REQ-plugins-710), `runToolLoop` SHALL pass it to
the run's `onPrivateReply` (`CreateTaskExecuteOpts.onPrivateReply`) and
SHALL build the tool message and the `ToolResult` event from `ok`,
`exitCode`, `message`, `error` and `data` only (`stringifyToolPayload`),
so the text never reaches a model request, a tool message, an event, the
summary or anything the model writes (answer, ask, tool argument, file, later
turn). `TaskResult.privateReplies` (`src/agent/types.ts`) SHALL carry
those texts for a bridge; absent when none. `MEMORY_AGENT_SYSTEM_INSTRUCTIONS`
SHALL add that private notes, `memory-profile` and the owner's
`memory-recall --person` view go straight to the person who asked by direct
message, that the model gets only a "sent privately" result and never their
content, and to tell them to check their DMs and never guess it; rule (i)
SHALL no longer list `memory-profile` among what acts on GitHub and SHALL
say profiles are never read there. The REQ-agent-010 / REQ-agent-101 /
REQ-agent-067 phrases stay.

Acceptance Criteria
- A fake-LLM run whose model calls `memory-profile` then `memory-recall --category private` in a Discord-conversation env hands both texts to `onPrivateReply`; no model request body, event or the result holds them; the third request carries the "sent privately" placeholder.
- The prompt names the MEMORY-7.a rule and that profiles are never read on GitHub.
- `tests/memory.private-view.test.ts` covers each and fails on main.
