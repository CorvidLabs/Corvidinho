---
change: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
artifact: testing
---

# Testing

Dry-run bridges with a fake gateway (its `reply`, `sendDm`, `editMessage`
and `deleteMessage` recorded), the in-memory thinking outbound and memory
SQLite, the scheduler polling every 20 ms; stub agents that wait until the
test finishes them (an abort ends them like a killed process, exit 137);
`SchedulerService` units with a fake stop control; `createScheduleRunStop`
units over a real `SessionRunControl`. No network, no model call, no key.

Fail-on-base proof: with the base's (8bf4422) sources swapped in for the four
modified source files (`src/discord/bridge.ts`, `src/scheduler/service.ts`,
`src/scheduler/store.ts`, `src/scheduler/index.ts`; the branch's new
`src/discord/schedule-stop.ts` kept so the imports resolve), `bun test
tests/discord.schedule-stop.test.ts` gave 2 pass, 7 fail; restored, 9 pass,
0 fail. The 2 that pass on the base are the `createScheduleRunStop` units,
which test the new module itself.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-304` | `tests/discord.schedule-stop.test.ts` ("its progress message carries the Stop button; …") | One progress embed `⏳ Schedule **Nightly** … running.` in the channel with one red `Stop` `cvstop:run_<n>`; the agent has a signal and session `schedule_<id>`; a third user's press: `This Stop button isn't for you.`, no abort; the creator's press: `⏹ Stopping the run.`, one abort; row `failed` / `stopped` / `stopped on Discord by <creator>`, no ask; schedule `active`, count 0, next run in the future; progress `⏹ Stopped` with `components: null`; no post; later press `Nothing is running.`; next due run: own button, ✅ post, progress deleted. Fail on base. |
| `REQ-discord-304` | `tests/discord.schedule-stop.test.ts` ("the owner's 'stop' reply …") | The owner's `Cancel!` reply to the progress message: one abort, one ack reply to the stop message, row stopped by the owner, no owner session; a third user's `stop` reply: nothing. Fail on base. |
| `REQ-discord-304` | `tests/discord.schedule-stop.test.ts` ("a schedule with no channel …", "a press in a guild channel …") | The owner gets the line by DM, then the Stop button by edit; the owner's DM press (no guild) stops the run; the DM is edited to `⏹ Stopped` with `components: null`; the next run's DM is deleted; nothing in a channel; the same message pressed in a guild channel off the allowlist stops nothing. Fail on base. |
| `REQ-discord-304` | `tests/discord.schedule-stop.test.ts` ("a stop is not a failure …", "a run nobody stopped …", "a run abandoned at shutdown …") | At `FAILURE_AUTO_PAUSE - 1` failures a stop keeps the count, the schedule `active`, no stored or posted question, one `finish`; a normal run finishes the control before its ✅ post; a throwing `begin` is logged and the run goes on; an abandoned run keeps `interrupted: bridge shutdown`. Fail on base. |
| `REQ-discord-304` | `tests/discord.schedule-stop.test.ts` ("createScheduleRunStop …" ×2) | No owner / no DM → null; a DM whose button edit fails is deleted and its turn released; a channel turn is `schedule_<id>` / creator / channel, `SessionRunControl.stop` aborts the handle, `finish` resolves the stopper twice, releases the turn, edits `⏹ Stopped` with `components: null`. New module (passes on both). |
| `REQ-discord-302` | `tests/discord.schedule-stop.test.ts` ("the owner's 'stop' reply …"); `tests/discord.stop-run.test.ts` (unchanged, green) | The `stop_run` route stops a schedule run through the same `SessionRunControl.stop` with the same ack; the chat stop-word tests still pass. |
| `REQ-discord-303` | `tests/discord.schedule-stop.test.ts` (first, third and fourth bridge tests); `tests/discord.stop-run.test.ts` (unchanged, green) | A schedule run's button takes the same press path (creator or owner stops, anyone else refused); the DM exception applies only to the live owner-DM run with no guild; the existing channel-gate tests (presses without a guild id) still refuse. |
