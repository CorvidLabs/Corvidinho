---
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
artifact: research
---

# Research

- `src/watch/owner-ask.ts` already has the bridge liveness signal:
  `markBridgeRunning` writes `discord_bridge_runner` (`<pid>:<proc start>`)
  into `schema_meta` when a bridge with a scheduler and a DM path starts;
  `bridgeRunning(db)` checks that process is alive (`isScheduleRunnerAlive`);
  the WATCH poller uses it for stuck GitHub asks (AGENT-16.a).
- `src/scheduler/store.ts`: `pendingAsks()` / `claimRunAsk()` /
  `releaseRunAsk()` (compare-and-set on `ask_posted_at IS NULL`, re-checking the
  run is still the schedule's newest) — the bridge's take; a taken ask is never
  listed again, so it is the persisted delivered marker.
- `src/scheduler/service.ts`: `deliverPendingAsks` ran only with
  `outbound.post`; `postRunAsk` builds the post (`formatAskReply`, schedule
  title with the SAFE-13 name rule, `askPingOwner` for spend-cap episodes,
  `spendStopFor` / `formatSpendStopDm` for the owner's details).
- `src/discord/private-reply.ts` `SendPrivateDm` is the gateway `sendDm`
  contract the MEMORY-ACL-6 forget cards, MEMORY-7.a private replies, spend
  DMs and WATCH stuck asks use; `src/discord/gateway.ts` `boundedContent` and
  `outboundAllowedMentions` are its safety (defang, no silent cut, no parsed
  mentions).
- `src/discord/register-commands.ts` already uses discord.js `REST` v10 with
  the bot token outside the gateway (slash registration).
- `src/discord/schedule-ask.ts`: the wait note (`formatScheduleWaitNote`)
  carries the ask's controls and goes out when a due run waits on an open,
  taken ask (`pendingWaitNotes`) — so a bridge that starts later gives the
  owner the controls without resending the question.
- No `corvidinho schedule …` CLI exists (`bun src/cli.ts --help`).
