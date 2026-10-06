---
id: i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c
state: implementing
type: feature
base_commit: 547232902f989f7d4e20069b99e01576e44cc0ae
---

# I or the schedule's creator can stop a scheduled run in progress from Discord, the same way as a chat run (AGENT-3.c)

## Intent

I or the schedule's creator can stop a scheduled run in progress from Discord, the same way as a chat run (AGENT-3.c)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- AGENT-3.c, captured in hi/agent.md in this change's PR from Leif's 2026-09-28 interview (round 13, 2026-09-30: 'Stop schedule runs: the owner or the schedule's creator can stop a schedule run in progress from Discord, like a chat run'): 'I or the schedule's creator can stop a scheduled run in progress from Discord, the same way as a chat run.' Observable outcomes: (1) a run the bridge's own ticker starts takes a turn on the bridge's SessionRunControl (session schedule_<id>, the schedule's creator as the requester) and, just before its agent starts, its progress message ('⏳ Schedule **<name>** (<id>) on <project>: running.', a ThinkingStatus embed) goes to the schedule's channel with the chat runs' red Stop button (cvstop:<runId>); (2) a press by the creator or the owner, past the same channel, actor and mute/rate gates, or their 'stop' / 'cancel' reply to that progress message, stops the run through SessionRunControl.stop (signal aborted once, the agent's process tree killed) with the same ack ('⏹ Stopping the run.', ephemeral for a press); anyone else's press gets 'This Stop button isn't for you.' and anyone else's reply is ordinary chat; (3) the stopped run's progress message becomes '⏹ Stopped' with its button cleared, and nothing else is posted (no result, no question, no failure line or DM); (4) the stop ends that run only: the schedule_runs row is failed with summary 'stopped' and error 'stopped on Discord by <user id>', no ask is stored, the schedule's consecutive-failure count is left as it is (no auto-pause) and its next due run goes ahead and posts as before; (5) a run that ends on its own removes its progress message; (6) a schedule with no channel sends the same line to the owner by DM, adds the Stop button to it once the run holds its turn, and a press there (no guild) on that live run passes without the channel gate; a stopped run's DM becomes '⏹ Stopped', any other run's DM is deleted; (7) a ticker with no stop control (the daemon) runs schedules as before; a run abandoned at shutdown stays recorded as abandoned. No new env var, config key, slash command, table, column or schema version; new tests fail on the base and pass on the branch.

## No-spec Rationale

Not applicable
