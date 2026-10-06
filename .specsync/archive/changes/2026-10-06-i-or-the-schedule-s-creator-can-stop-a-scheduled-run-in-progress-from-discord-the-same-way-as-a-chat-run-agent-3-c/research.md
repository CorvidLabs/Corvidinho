---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: research
---

# Research

- Sources: the interview record (round 13 "Stop schedule runs", "Stop and
  the queue"), the stop-button rows of `/home/user/coord/m34-defaults.md`,
  #332 / #341's archived changes (queue, stop words, Stop button) and issue
  #124 (tracker; no schedule-stop detail of its own).
- `SchedulerService.runOne` (src/scheduler/service.ts) spawns the run with
  one `AbortSignal` (its `InFlight.stop`), aborted only by
  `abandonInFlight` at shutdown; the spawn client kills the run's whole
  process group on abort and resolves normally (`ok: false`, exit 137), so a
  linked signal is enough to stop a schedule run.
- `SessionRunControl` (src/discord/run-control.ts) is in-memory and keyed by
  session id; a schedule never runs twice at once (`running` map), so a
  `schedule_<id>` turn never waits. Its `close()` (bridge stop) aborts
  every running turn, and in `bridge.stop()` `abandonInFlight` runs in the
  same synchronous block, so a shutdown is still recorded as abandoned.
- `pressStopButton` and the router's `stop_run` look the run up by its
  progress message id and check channel equality and requester-or-owner;
  nothing in them is chat-specific (`store.get(sessionId)` is just
  undefined for a schedule session).
- `schedule_runs.status` is free TEXT; nothing user-facing reads run
  statuses. A stopped `/work` is recorded `failed` with the summary
  `stopped` (REQ-discord-302) — the existing-states precedent.
  `markRunFinished` counts failures in SQL (`consecutive_failures + 1`),
  which would auto-pause at 5, so a stop needs a branch that keeps the count.
- The gateway has no DM message intent (only Guilds, GuildMessages,
  MessageContent): button interactions in DMs arrive, DM text does not.
  `sendDm` resolves the DM channel id only after sending. Schedule-ask
  presses in a DM pass the channel gate when the schedule has no channel
  (`pressChannelOk`, no guild).
- Test presses in the existing suites carry no `guildId`, so a DM exception
  keyed on the missing guild alone would bypass their channel-gate tests; it
  has to be keyed on the live DM run too.
