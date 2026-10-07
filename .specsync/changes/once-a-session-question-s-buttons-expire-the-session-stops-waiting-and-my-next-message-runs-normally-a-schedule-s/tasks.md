---
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
artifact: tasks
---

# Tasks

- [x] Capture AUTONOMY-6.b with `hi` from Leif's 2026-09-28 interview (round 17); `hi check` passes.
- [x] Confirm on main that an expired session button ask is dropped before the thin-reply gate and the next message runs, and that schedule asks have no time condition.
- [x] `tests/discord.expired-asks.test.ts`: session half (chat, `/session start`), schedule half (tick and press), hi/doc citation cases (7 tests).
- [x] `docs/discord.md` and `docs/DISCORD-GO-LIVE.md` cite AUTONOMY-6.b where the expiry is described.
- [x] Spec prose and `files:` (`discord.spec.md`), Modified REQ-discord-044 / REQ-discord-045 delta, `specs/discord/testing.md` evidence.
- [x] Fail-on-base proof and mutation checks recorded in testing.md.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
