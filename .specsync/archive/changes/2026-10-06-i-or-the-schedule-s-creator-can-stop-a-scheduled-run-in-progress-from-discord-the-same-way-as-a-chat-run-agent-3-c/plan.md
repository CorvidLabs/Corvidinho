---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: plan
---

# Plan

1. Capture AGENT-3.c with `hi` (own commit); `hi check`.
2. Store: `markRunFinished` `stopped` (count kept, no ask).
3. Scheduler: `ScheduleRunStop` / `ScheduleRunStopHandle` types, `runStop`
   option, `beginStop` / `recordStopped`, linked signal, `finish` on every
   path, `finish()` recorder's `stopped`; index exports.
4. `src/discord/schedule-stop.ts`: channel and owner-DM controls on the
   bridge's `SessionRunControl`.
5. Bridge: wire the control; DM press gate exception; run-control header note.
6. Tests: `tests/discord.schedule-stop.test.ts`; fail-on-base proof (swap the
   base's four modified sources in, keep `schedule-stop.ts`, run, restore).
7. Docs (`docs/discord.md`, `docs/DAEMON.md`, `docs/DISCORD-GO-LIVE.md`),
   spec prose (`discord.spec.md` files, Public API, Invariants, scenario,
   error rows), `specs/discord/testing.md`, deltas.
8. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
