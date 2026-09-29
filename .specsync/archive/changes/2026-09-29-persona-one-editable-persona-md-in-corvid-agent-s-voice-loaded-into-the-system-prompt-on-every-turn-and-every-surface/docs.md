---
change: persona-one-editable-persona-md-in-corvid-agent-s-voice-loaded-into-the-system-prompt-on-every-turn-and-every-surface
artifact: docs
---

# Docs

- `README.md`: new "Persona (PERSONA-1..3)" section: where the file is,
  which surfaces read it, that the rules win, edit and commit to change it,
  8 KiB cap and scrub, no setting.
- `docs/DISCORD-GO-LIVE.md`: operator guide E.8 "Persona file": the
  checkout the bridge / WATCH / daemon run from, HEAD-only (the updater
  checks out the merged ref, so a hand edit on the VM is not loaded), cap,
  no secrets, the `Persona: …` note.
- `specs/agent/agent.spec.md`: `files:` gains `src/agent/persona.ts`,
  `persona.md`, `tests/agent.persona.test.ts`; Public API paragraph
  (persona exports, `exactRoot`), an Invariants paragraph, a scenario and
  four Error Cases rows.
- `specs/agent/testing.md`: "Persona file (REQ-agent-069, PERSONA-1..3)".
- Delta: agent (Added REQ-agent-069).
- No CHANGELOG, STATUS or package version change; no new env var or flag to
  document.
