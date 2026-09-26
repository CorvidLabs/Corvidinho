---
id: hear-slash-commands-for-session-status-agents-work-discord-4-steal-from-corvid-agent-thin-useful-set-fixture-tests-no
state: archived
type: feature
base_commit: 8d6976d8f2317ba95d061733739247ec4bf6ed2a
---

# HEAR slash commands for session/status/agents/work (DISCORD-4) — steal from corvid-agent; thin useful set; fixture tests; no ProcessManager; STATUS Done for #11

## Intent

HEAR slash commands for session/status/agents/work (DISCORD-4) — steal from corvid-agent; thin useful set; fixture tests; no ProcessManager; STATUS Done for #11

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Bridge registers and dispatches thin slash set /session /status /agents /work (DISCORD-4); channel allowlist re-checked at handler time (DISCORD-5/7 light); session list/start and work drive SessionStore + in-memory work stubs via AgentClient (no ProcessManager); fixture tests without live Discord token; allowlists remain default-deny; STATUS Done lists #11 when merged; SpecSync + fledge verify green

## No-spec Rationale

Not applicable
