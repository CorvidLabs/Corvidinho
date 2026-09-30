---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: docs
---

# Docs

- `docs/discord.md`: new "The Stop button" paragraph after "One run at a
  time, and `stop`" (where the button shows, who can press it, the private
  ack and replies, the gates, cleared on done / fail / stop, stale button,
  waiting messages still run); that paragraph's "A Stop button … come later"
  now says only schedule stops come later and that the restart notice
  removes the button; the source map line names the `cvstop` branch.
- Specs: `specs/discord/discord.spec.md` (Public API, Invariants, a scenario,
  error rows) and `specs/discord/testing.md`.
- No `hi/` change (AGENT-3.a / AGENT-3.b already captured). No README,
  DISCORD-GO-LIVE, CHANGELOG, STATUS or package.json edit: no new knob or
  permission (buttons need none), and the release PR writes the rest.
