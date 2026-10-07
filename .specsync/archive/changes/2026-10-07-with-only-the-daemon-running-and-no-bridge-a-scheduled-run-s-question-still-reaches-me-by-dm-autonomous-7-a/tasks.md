---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: tasks
---

# Tasks

- [x] Capture AUTONOMOUS-7.a with `hi` (`hi/autonomous.md`, `INTENT.md`); `hi check`.
- [x] `src/discord/rest-dm.ts`: `createRestSendDm` over Discord's REST API (no gateway), `DiscordRestClient` seam.
- [x] `src/discord/config.ts` exports `resolveDiscordToken`; `src/discord/schedule-ask.ts` adds `formatScheduleAskDaemonNote`.
- [x] `src/scheduler/service.ts`: `ownerDm` option, DM delivery pass (bridge-live check, gate, claim, DM, hand back, retry wait, log once), start after a run's ask, settle hand-back; `src/scheduler/index.ts` exports.
- [x] `src/daemon/daemon.ts`: wire `ownerDm` (`bridgeRunning`, spend alert outbox, logger), `ownerDm` on `daemon.started`, settle on stop, `discordRest` seam; `tests/preload.ts` unsets the Discord tokens.
- [x] Tests `tests/daemon.owner-dm.test.ts` (12) and `tests/discord.rest-dm.test.ts` (5); fail-on-main proof in testing.md.
- [x] Docs: `docs/DAEMON.md`, `docs/DISCORD-GO-LIVE.md`, `docs/discord.md`, `README.md`, `.env.example`.
- [x] Spec prose (discord, cli), module testing evidence, deltas (REQ-discord-707 / REQ-cli-707 added; REQ-discord-347 / REQ-discord-353 / REQ-cli-098 modified).
- [x] `specsync change approve`, `change check --commit`, `change audit`, `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
