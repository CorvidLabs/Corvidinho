---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: docs
---

# Docs

- `docs/discord.md`: new "Stopping a scheduled run" paragraph after "The Stop
  button" (the progress message and its button, who can stop it, what a stop
  records and posts, the next run, the no-channel DM, no button for daemon
  runs, a stale button); the "One run at a time" paragraph's "Stopping a
  schedule's run from Discord comes later" now points to it; the DM list in
  the asks paragraph names the no-channel schedule's Stop DM; a new row in the
  failure-behaviour table.
- `docs/DAEMON.md`: a daemon-claimed run has no Stop button on Discord.
- `docs/DISCORD-GO-LIVE.md`: a bullet on stopping a scheduled run (channel
  button, the owner's DM for a schedule with no channel, same DM rule, daemon
  runs excluded).
- `hi/agent.md` + `INTENT.md`: AGENT-3.c captured with `hi`.
- Specs: `specs/discord/discord.spec.md` (files, Public API, Invariants,
  scenario, error rows) and `specs/discord/testing.md`.
- No README, CHANGELOG, STATUS or package.json edit: no new knob, permission
  or command (DMs and buttons need none beyond what the bridge already uses).
