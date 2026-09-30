---
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
artifact: docs
---

# Docs

- `docs/discord.md`: new "One run at a time, and `stop`" paragraph under
  Session replies (the queue, no waiting indicator, who can stop and how, the
  ack, `⏹ Stopped` with the footer, the card as a no, `/work` failed and no PR,
  waiting messages still run, nothing-running behaviour, bridge stop, the Stop
  button and schedule stop still to come); the cancel sentence of the
  pending-ask paragraph says a run going is stopped instead; source map line;
  `/work` PR gate row for a stopped run.
- Specs: `specs/discord/discord.spec.md` (files list, Public API, Invariants,
  a scenario, error rows) and `specs/discord/testing.md`.
- `hi/agent.md` / `INTENT.md`: AGENT-3.b captured with `hi` (separate commit).
- No README, DISCORD-GO-LIVE, CHANGELOG, STATUS or package.json edit: no new
  knob, and the release PR writes the rest.
