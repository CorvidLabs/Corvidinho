---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: plan
---

# Plan

1. Capture AUTONOMOUS-7.a with `hi` (own commit); `hi check`.
2. `src/discord/rest-dm.ts`; export `resolveDiscordToken`;
   `formatScheduleAskDaemonNote`.
3. `SchedulerServiceOpts.ownerDm` and the DM delivery pass in
   `src/scheduler/service.ts`; exports in `src/scheduler/index.ts`.
4. Wire it in `src/daemon/daemon.ts` (`discordRest` seam, `ownerDm` on
   `daemon.started`, settle on stop); unset the tokens in `tests/preload.ts`.
5. Tests `tests/daemon.owner-dm.test.ts` and `tests/discord.rest-dm.test.ts`;
   swap main's `src/` in to prove they fail, restore.
6. Docs (DAEMON.md, DISCORD-GO-LIVE.md, discord.md, README, .env.example),
   spec prose, module testing evidence, deltas.
7. Approve, `change check --commit`, `change audit`, `specsync check
   --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
