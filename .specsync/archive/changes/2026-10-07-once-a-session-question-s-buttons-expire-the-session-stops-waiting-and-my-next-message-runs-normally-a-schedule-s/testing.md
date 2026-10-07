---
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
artifact: testing
---

# Testing

`tests/discord.expired-asks.test.ts` (new, 9 tests): `startBridge` with a
null gateway (replies and thinking edits recorded), an in-memory DB with a
`ScheduleStore`, an owner configured and an agent whose first chat run asks
a two-choice Choose question; a manual `SchedulerService` on an in-memory DB
with an injected clock; a second bridge on the same DB for a restart; the
system clock frozen with `setSystemTime` and moved to one minute inside and
one minute past `ASK_BUTTON_TTL_MS`. No network, no token.

Fail-on-base proof: with main 85871fa4's `docs/discord.md`,
`docs/DISCORD-GO-LIVE.md`, `hi/autonomy.md` and `INTENT.md` swapped in,
`bun test tests/discord.expired-asks.test.ts` gave 7 pass, 2 fail: the hi
and doc citation cases (no AUTONOMY-6.b on main). The seven behaviour cases
pass on main, because the bridge and the scheduler already behave this way —
this change records Leif's decision, it does not change behaviour.
Mutation checks: disabling the expired-ask clear in the bridge's continue
path fails the five session cases (chat thin reply and new request,
`/session start`, `/work`, restart: the thin reply restates the dead
question, or the expired ask stays pending); making
`ScheduleStore.openAsk` / `openRunAsk` drop an ask 30 minutes after its
run finished fails both schedule cases (the due run starts; the Choose press
is refused). Restored: 9 of 9 pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-044` | `tests/discord.expired-asks.test.ts` "inside its ~30 minutes a thin reply restates the Choose question; one minute past them a thin reply runs normally and nothing is left waiting" | the ask's `expiresAt` is the ask time plus `ASK_BUTTON_TTL_MS`; at +29 min `ok` restates it with its Choose button and runs nothing; at +31 min `ok` runs the agent with no prior-question block, posts no stub or Choose button for it, leaves no pending or open ask; a late press gets `ASK_CHOICE_EXPIRED`; a later `ok` runs too. |
| `REQ-discord-044` | same file, "… one minute past them a new request runs normally and nothing is left waiting" | the same with a substantive message past the window. |
| `REQ-discord-044` | same file, "a thin reply to a /session start Choose answer restates it inside ~30 minutes, and runs normally one minute past them" | `/session start`: the answer is the Choose stub; a reply `ok` to it at +29 min restates, at +31 min runs with no prior-question block and leaves no pending or open ask. |
| `REQ-discord-044` | same file, "a thin reply to a /work Choose answer restates it inside ~30 minutes, and runs normally one minute past them" | `/work` (requester declared team, IDENTITY-11.a): the task is `blocked`, the answer is the Choose stub; the same restate at +29 min and run at +31 min. |
| `REQ-discord-044` | same file, "after a restart a thin reply still restates the ask inside its window, and one minute past it the next message runs" | the first bridge stops after the ask; a second bridge on the same DB loads it with its `expiresAt`; at +29 min `ok` restates it and runs nothing; at +31 min `ok` runs with no prior-question block, leaves no pending ask, and a late press gets `ASK_CHOICE_EXPIRED`. |
| `REQ-discord-045` | same file, "one minute past a session ask's ~30 minutes, the session's Choose is expired while the schedule's Choose still opens and takes a pick" | session and schedule asks of the same age at +31 min: the session Choose press gets `ASK_CHOICE_EXPIRED`; the creator's chat message runs and leaves the schedule ask open; the schedule's Choose opens its choices and a pick closes it (`picked`, "Postgres"). |
| `REQ-discord-045` | same file, "the schedule's due runs keep waiting one minute past the ~30 minutes and a day on, with one note, until the question is answered" | `*/5` schedule: the run at 10:05 asks; ticks at +31 min and +1 day +31 min skip it (`skipped`, no run, one wait note, ask still open); after the owner's pick the next due run starts with the answer in its prompt. |
| `REQ-discord-044` / `REQ-discord-045` | same file, "hi/autonomy.md holds Leif's text under AUTONOMY-6" and "docs/discord.md cites AUTONOMY-6.b …" | the captured text sits after AUTONOMY-6.a; the three docs/discord.md passages and the DISCORD-GO-LIVE.md bullet cite AUTONOMY-6.b. Fail on the base sources. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
