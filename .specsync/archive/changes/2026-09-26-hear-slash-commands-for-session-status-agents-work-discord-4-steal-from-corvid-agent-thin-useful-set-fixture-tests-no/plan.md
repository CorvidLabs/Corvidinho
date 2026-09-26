---
change: hear-slash-commands-for-session-status-agents-work-discord-4-steal-from-corvid-agent-thin-useful-set-fixture-tests-no
artifact: plan
---

# Plan

1. Add fixture-friendly `SlashInteraction` + `SlashContext` types and command JSON bodies.
2. Implement dispatch map + handlers (session/status/agents/work) + WorkStore.
3. Extend SessionStore.list; wire gateway InteractionCreate + command registration.
4. Bridge wires slash context (store/agent/workStore/thinking).
5. Fixture tests for build/dispatch/handlers/gates; SpecSync discord delta; STATUS.
6. `fledge lanes run verify --non-interactive` then review/finalize/archive.
