---
change: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
artifact: tasks
---

# Tasks

- [x] Re-check the gap on origin/main; repro a deny-listed creator's schedule running and posting.
- [x] Regression tests that fail on origin/main (`tests/scheduler.actor-gate.test.ts`, `tests/daemon.test.ts` live-allowlist block).
- [x] Scheduler: `gateTick` (creator actor gate + channel) before the run and before the post.
- [x] Daemon: pass the configured owner; reload the allowlist before each tick; skip the tick with `tick.allowlist_failed` when the file does not load.
- [x] Daemon test fixture blanks operator Discord user/role/deny lists and owner env.
- [x] Docs: `docs/DAEMON.md` (gates + log event), `docs/discord.md` (schedule tick gates row).
- [x] Specs: deltas Modified REQ-discord-020 and REQ-cli-108; discord/cli spec invariants, cli error case, discord files list, module testing notes.
