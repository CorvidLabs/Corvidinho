---
change: schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the
artifact: docs
---

# Docs

- `docs/discord.md` (asks section): a schedule run that cannot start posts
  a stuck ask with a fixed question (no host path), and the run that
  auto-pauses the schedule posts a stuck ask naming the pause and
  `/schedule resume` instead of its ❌ line; daemon runs are posted by the
  bridge's next tick. Tick gates row: the pause ask of refused runs posts
  only once the gate passes again.
- `docs/DAEMON.md`: the needs-human paragraph and the `run.needs_human`
  log row include a run that could not start and the run that auto-paused
  its schedule.
- `specs/discord/discord.spec.md`: REQ-discord-353 paragraph (store
  `autoPause`, service exports). `specs/discord/testing.md`: the new tests.
- No operator knob, env var, slash command or CLI flag.
