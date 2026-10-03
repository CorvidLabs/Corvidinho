---
module: agent
change: missing-plugin-asks-soft-land-with-the-real-gap
---

# Delta — agent (missing-plugin soft-land)

## Added

### REQUIREMENT REQ-agent-742

When a task names a plugin or tool, or asks for a GIF, and that capability is not in the run's offered catalog, execute SHALL reply with the concrete gap and SHALL NOT call the model: not installed (not registered, or not in the Fledge plugin list when discovery ran), not allowlisted (SAFE-1), not configured (the tool's real key, `GIPHY_API_KEY` or `BRAVE_SEARCH_API_KEY`), not available for the acting role (ROLES-CHAT-2 / PLUGIN-9; community stays read/chat), or below the run's capability tier. The reply SHALL cite an HI id or an open PR number only when that id or PR was returned by the lookup, and SHALL NOT invent a plugin or a third-party API. A vague install question ("what do you mean by install?") when the task already named the plugin SHALL be that same reply, or a steer back to an offered tool, never a clarify ask. When a candidate tool is already offered, the run SHALL NOT be replaced by this reply.

Acceptance Criteria
- "Install the gif plugin" with no allowlist and no discovered `gif` command does not call the model; the summary names `gif-search` not allowlisted and `fledge-gif` not installed, cites only lookup HI ids and PR numbers, and has no clarify `ask`.
- "dog GIFs" with `gif-search` offered still calls the model.
- A community role gap does not tell that session to edit the allowlist.
- An unknown name is not installed; the reply does not invent Tenor or a `fledge-` command the user did not say.
- A model `ask-human` of "what do you mean by install?" when the named tool is offered does not end as a clarify ask.
- Fixture: `tests/agent.missing-capability.test.ts`.

### FILE src/agent/missing-capability.ts

Owned by the agent spec (`files:`), with `tests/agent.missing-capability.test.ts`.
