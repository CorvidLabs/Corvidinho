---
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
artifact: requirements
---

# Requirements

- AGENT-3 (captured, `hi/agent.md`): "It runs a tool loop I can interrupt,
  and when I interrupt it, it actually stops instead of finishing in the
  background."
- AGENT-3.a (captured, `hi/agent.md`, Leif 2026-09-28): "In Discord I can
  stop a run with a Stop button or by saying stop or cancel, and so can the
  person who asked; a message sent while a run is going waits for it instead
  of starting a second run." Built here: the Stop button on the progress
  message of chat, ask pick / Answer resume, `/session start` and `/work`
  runs, which completes AGENT-3.a for those runs (the stop words and the
  queue came in #332). Not built here: stopping a schedule's run from Discord
  (round 13; a later slice).
- AGENT-3.b (captured in #332, Leif 2026-09-30): "After I stop a run,
  messages that were waiting still run, in order." Kept: a Stop press uses the
  same `SessionRunControl.stop`, which never drops a waiting turn.
- Defaults applied (`/home/user/coord/m34-defaults.md`, stop-button rows; not
  Leif decisions): a stale Stop button gets the ephemeral 'Nothing is
  running.'; nothing-running words keep today's behaviour.
- Planned design (slice record, not new criteria): one danger-style `Stop`
  button, custom id `cvstop:<runId>`; requester or owner stops, anyone else
  gets the ephemeral 'This Stop button isn't for you.'; components cleared on
  done, fail and stop; the cvstop branch behind the channel, actor and
  rate / mute gates, separate from `cvok` / `cvask` / a later
  `cvstop-schedule`.
- Kept: REQ-discord-212 / 201 / 010 gates (shared with the ask presses),
  IDENTITY-1 owner check, DISCORD-15 / 15.a footer, SAFE-20 card pass after a
  stop, REQ-discord-311 interrupted notice, DISCORD-ASK-7 stub reuse, the
  stop words (REQ-discord-302).
- Added: REQ-discord-303 (the Stop button). Modified: REQ-discord-302 (the
  "later slice" sentence now points at REQ-discord-303; a press and a 'stop'
  reply share one stop), REQ-discord-548 (the Answer form's resumed stub shows
  the Stop button in place of the Answer button while the run goes).
- No new env var, config key, slash command, table, column or schema version.
