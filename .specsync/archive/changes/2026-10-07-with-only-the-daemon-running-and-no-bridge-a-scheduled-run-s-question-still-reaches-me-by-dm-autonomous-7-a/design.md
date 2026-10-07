---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: design
---

# Design

- `src/discord/rest-dm.ts` (new): `createRestSendDm({ token, rest?, onError? })`
  returns a `SendPrivateDm` over Discord's REST API — `POST /users/@me/channels`
  (`recipient_id`), then `POST /channels/<id>/messages` with
  `boundedContent(...)` and `allowed_mentions: { parse: [] }`, no components.
  Null (never a throw) when it does not go out; `onError` gets one scrubbed
  line. The default client is discord.js `REST` v10, created on first use;
  `rest` is the test seam (`DiscordRestClient`). Snowflake checks on the user
  id and the returned ids keep the routes clean.
- `src/scheduler/service.ts`: optional `SchedulerServiceOpts.ownerDm`
  (`ScheduleOwnerDm`: `send?`, `bridgeLive`, `spendAlerts?`, `log?`,
  `retryMs?`). `deliverPendingAsks` keeps the bridge path
  (`postPendingAsks`, unchanged) and, for a ticker with no `outbound.post` but
  `ownerDm`, runs `dmPendingAsks`: per pending ask — stop if a bridge is live
  (a throw counts as live), skip on the DISCORD-SCHEDULE-3 gate or inside the
  retry wait, no `send` / no live owner → log once and stop, else
  `claimRunAsk`, DM (`ownerDmContent`), log sent, or hand back + retry later.
  `postOwnRunAsk` starts the pass right after a daemon run records an ask.
  `settleAskDelivery` hands back a DM still in flight when it times out (the
  WATCH ask delivery pattern).
- DM content reuses the schedule ask post: `formatAskReply({ owner: null,
  prefix: title, context: summary })` (scrubbed, defanged, quoted; no
  mention), or for a spend-cap stop whose episode `askPingOwner` claims the
  `formatSpendStopDm` details after the scrubbed title; then
  `formatScheduleAskDaemonNote(schedule)` (`src/discord/schedule-ask.ts`) via
  `appendPostLine` within `DISCORD_DM_MAX`.
- `src/daemon/daemon.ts`: wires `ownerDm` (`createRestSendDm` when
  `resolveDiscordToken(env)` has a token, `bridgeRunning(db)`,
  `createSpendAlertOutbox({ db, env })`, its logger), adds `ownerDm` to
  `daemon.started`, logs `schedule_ask.dm_error` from the REST sender, and
  waits `settleAskDelivery(ABANDONED_SETTLE_MS)` before closing the DB on stop.
  `StartDaemonOptions.discordRest` is the test seam.
- `src/discord/config.ts`: `resolveToken` becomes the exported
  `resolveDiscordToken` (same behaviour).
- `tests/preload.ts`: unset `DISCORD_TOKEN` / `DISCORD_BOT_TOKEN`.
- No schema change, no new env var, config key, slash command or CLI command.
