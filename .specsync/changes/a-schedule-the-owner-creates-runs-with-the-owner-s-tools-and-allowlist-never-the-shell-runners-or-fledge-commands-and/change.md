---
id: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
state: approved
type: feature
base_commit: af4597e5327edfc7b59718af5db8d030474459d1
---

# A schedule the owner creates runs with the owner's tools and allowlist (never the shell, runners or Fledge commands) and asks on Approve cards where the must-ask list says so, a denied or lapsed card ending the run with a blocking ask; schedules other people create stay read-only (DISCORD-SCHEDULE-1.a)

## Intent

A schedule the owner creates runs with the owner's tools and allowlist (never the shell, runners or Fledge commands) and asks on Approve cards where the must-ask list says so, a denied or lapsed card ending the run with a blocking ask; schedules other people create stay read-only (DISCORD-SCHEDULE-1.a)

## Affected Canonical Specs

- `discord`
- `agent`
- `plugins`
- `cli`

## Acceptance Criteria

- The scheduler reads the owner live at each run (SchedulerServiceOpts.loadOwner, wired by the bridge and the daemon to re-read the owner config; the start-time owner when not wired; a read that throws is no owner) and, after the DISCORD-SCHEDULE-3 creator/channel gate, spawns the run with actingIsAdmin true only when the creator is that live owner and resolves to owner (not muted or deny-listed); every other schedule is spawned community and no schedule passes actingRole, so none is stamped team; the spawned run's tool layer resolves the owner's schedule to owner and any other schedule to community, and resolveActingRole never returns team in a scheduled run (isScheduleRunEnv) whatever the stamp; the owner's schedule run is offered the dangerous tools its allowlist names but never the SAFE-3.a shell, runners or Fledge core runs (the schedule surface stays refused) and createTaskExecute does not discover Fledge plugin commands in a scheduled run; a must-ask call in the owner's schedule run (e.g. discord-post-message) raises the Approve card, and a deny, a lapse or a resent deny ends the run blocked with a stuck ask naming the refused tool, its why, the rule and the card (mustAskRefusedAsk), which the scheduler records so the next due ticks are skipped with one wait note and raise no new card (AUTONOMY-6.a); outside a schedule the refusal still goes back to the model; the schedule's own result/ask/wait posts need no card; an owner schedule on a non-git project keeps its own scoped folder; tests/scheduler.owner-role.test.ts, the schedule-run stamp tests in tests/roles.team.test.ts and tests/agent.allowlisted-dangerous.test.ts fail on the base sources and pass on the branch

## No-spec Rationale

Not applicable
