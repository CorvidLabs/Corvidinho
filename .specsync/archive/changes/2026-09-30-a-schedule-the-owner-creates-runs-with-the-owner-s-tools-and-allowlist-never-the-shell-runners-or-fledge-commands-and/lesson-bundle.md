# Lesson bundle — a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A schedule the owner creates runs with the owner's tools and allowlist (never the shell, runners or Fledge commands) and asks on Approve cards where the must-ask list says so, a denied or lapsed card ending the run with a blocking ask; schedules other people create stay read-only (DISCORD-SCHEDULE-1.a)
- **Kind**: Feature
- **Specs**: discord, agent, plugins, cli
- **Paths**: src/scheduler/service.ts, src/discord/bridge.ts, src/discord/agent-client.ts, src/daemon/daemon.ts, src/plugins/roles.ts, src/agent/execute.ts, src/agent/ask.ts, tests/scheduler.owner-role.test.ts, tests/roles.team.test.ts, tests/agent.allowlisted-dangerous.test.ts, specs/discord/discord.spec.md, specs/discord/testing.md, specs/agent/agent.spec.md, specs/agent/testing.md, specs/plugins/plugins.spec.md, specs/plugins/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md, docs/DISCORD-GO-LIVE.md, docs/discord.md, docs/DAEMON.md
- **Acceptance**: The scheduler reads the owner live at each run (SchedulerServiceOpts.loadOwner, wired by the bridge and the daemon to re-read the owner config; the start-time owner when not wired; a read that throws is no owner) and, after the DISCORD-SCHEDULE-3 creator/channel gate, spawns the run with actingIsAdmin true only when the creator is that live owner and resolves to owner (not muted or deny-listed); every other schedule is spawned community and no schedule passes actingRole, so none is stamped team; the spawned run's tool layer resolves the owner's schedule to owner and any other schedule to community, and resolveActingRole never returns team in a scheduled run (isScheduleRunEnv) whatever the stamp; the owner's schedule run is offered the dangerous tools its allowlist names but never the SAFE-3.a shell, runners or Fledge core runs (the schedule surface stays refused) and createTaskExecute does not discover Fledge plugin commands in a scheduled run; a must-ask call in the owner's schedule run (e.g. discord-post-message) raises the Approve card, and a deny, a lapse or a resent deny ends the run blocked with a stuck ask naming the refused tool, its why, the rule and the card (mustAskRefusedAsk), which the scheduler records so the next due ticks are skipped with one wait note and raise no new card (AUTONOMY-6.a); outside a schedule the refusal still goes back to the model; the schedule's own result/ask/wait posts need no card; an owner schedule on a non-git project keeps its own scoped folder; tests/scheduler.owner-role.test.ts, the schedule-run stamp tests in tests/roles.team.test.ts and tests/agent.allowlisted-dangerous.test.ts fail on the base sources and pass on the branch

## Evidence

- Verification commit: `d867e80265cc4e58a5343af6f050cc339f99b740`
- Base commit: `af4597e5327edfc7b59718af5db8d030474459d1`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins`

## From the change's context.md

# Context

Milestone #124 (M4 safe autonomy), slice schedules-owner of the M3/M4 plan
(`/home/user/coord/pr-schedule-owner-role.json`). DISCORD-SCHEDULE-1.a is
captured on main from Leif's 2026-09-28 interview: "A schedule I create runs
with my tools and my allowlist (still never the shell or runners, SAFE-3.a)
and asks me through Approve cards where the must-ask list says so; schedules
other people create stay read-only." Nothing new is captured in `hi/`.

What was true on main (af4597e): `SchedulerService.runOne` spawned every
scheduled run with `actingIsAdmin: false`, so the owner's own schedules were
community (read and chat tools only) and never reached a must-ask card; the
owner was the one given at start (`opts.owner`), and `resolveActingRole`
would have given a team stamp in a scheduled run the team role. Everything
this builds on is merged: the approvals engine (#316), the must-ask gate
(#319, `src/plugins/must-ask.ts`), blocking schedule asks (#322, schema v15,
`src/discord/schedule-ask.ts`), the SAFE-3.a shell gate (#324,
`src/agent/shell-gate.ts`, which refuses the `schedule` surface), the
schedule repo gate (#311), non-owner prompt fencing (#307), the model
fallback (#325) and the busy-lock (#323).

Constraints: specs only through SpecSync; no new config key, env var, table
or schema bump; #232 / #233 scope untouched; v1 off-chain. Conservative
defaults come from the schedules-owner rows of
`/home/user/coord/m34-defaults.md` and are listed in the PR under "Design
choices pending Leif".

## From the change's design.md

# Design

- **Live owner** (`src/scheduler/service.ts`): `SchedulerServiceOpts.loadOwner`
  (sync or async); `liveOwner()` calls it per run (else `opts.owner`; a throw
  is logged and is no owner). `roleOf(userId, owner = this.owner)` and
  `answerBlock(answered, owner)` take the owner to judge against.
- **Stamp** (`runOne`): after `gateTick`, `liveOwner()`, then the creator's
  role against it; `byOwner = creatorRole === "owner" &&
  isOwnerDiscord(liveOwner, createdByUserId)` decides both the SAFE-12 prompt
  shape (as before) and `actingIsAdmin`. No `actingRole` is passed, so the
  spawn client never stamps team. Surface and session id unchanged.
- **Wiring**: the bridge passes `loadOwner: () => loadOwnerConfig({ env,
  filePath: config.allowlist.sourcePath })` (the same source its start-time
  owner came from); the daemon `loadOwner: () => loadOwnerConfig({ env })`.
- **Tool layer** (`src/plugins/roles.ts`): in `resolveActingRole`, after the
  ADMIN re-check and the community cap, a scheduled run returns community, so
  no stamp gives a schedule team.
- **Task run** (`src/agent/execute.ts`): Fledge discovery also needs
  `!isScheduleRunEnv(env)`. In `runToolLoop`, right after an offered call's
  `ToolResult`, `mustAskRefusedAsk(name, result)` (new in `src/agent/ask.ts`)
  in a scheduled run ends the run with `askExecuteResult`, after one operator
  Text line.
- **Not changed**: the must-ask gate and its card kinds, the SAFE-3.a gate,
  the scheduler's ask recording / delivery / wait notes (the new ask is an
  ordinary run ask), the schedule's own posts (never through `runPlugin`),
  the worktree manager (non-git projects keep their scoped folder), the
  schema.

## From the change's testing.md

# Testing

Regression tests (fixtures only: memory / temp SQLite stores, a temp
allowlist file, a recording agent, a fake spawn bin that resolves the role in
the child, an injected fake provider, the real approvals store answered by
`tests/fixtures/must-ask.ts`, `startDaemon` and `startBridge` with a null
gateway; no network, no tokens).

- `tests/scheduler.owner-role.test.ts` (18 tests, new).
- `tests/roles.team.test.ts` (3 tests added: "DISCORD-SCHEDULE-1.a:
  schedule-run stamps in the tool layer").
- `tests/agent.allowlisted-dangerous.test.ts` (1 test added: the owner's own
  scheduled run and Fledge discovery).

Fail-on-base proof: in this branch's worktree, the base's (af4597e)
`src/scheduler/service.ts`, `src/plugins/roles.ts`, `src/agent/execute.ts`,
`src/discord/bridge.ts`, `src/daemon/daemon.ts` and
`src/discord/agent-client.ts` swapped in (the branch's additive
`src/agent/ask.ts` kept, so the new file loads): 15 failures — 11 of 18 in
`scheduler.owner-role` (all but the read-only, owner-chat, other-person,
no-private-place and three `mustAskRefusedAsk` unit guards), all 3 new `roles.team` tests and the
new `agent.allowlisted-dangerous` test; with the base's `src/agent/ask.ts`
too the new file cannot load. With the branch's sources restored all 67 tests
in the three files pass. On the branch: `bunx tsc --noEmit` clean, full
`bun test` green, `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the owner's own schedule runs with the owner stamp and the schedule surface; its own result post needs no card" | `actingIsAdmin: true`, no `actingRole`, surface `schedule`, session `schedule_<id>`, prompt unfenced; one `✅` post to the channel. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "schedules other people create stay read-only: a declared team member's and a stranger's run community, never team" | Both spawned `actingIsAdmin: false`, `actingRole` undefined, surface `schedule`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the owner is read live: …" | Start-time owner A, `loadOwner` names B: A's schedule `false` and fenced `role: community`, B's `true`; two reads for two runs. |
| `REQ-discord-713` | same test | The creator's role for the SAFE-12 fence uses the live owner. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "no owner configured now, an owner read that fails, or a muted owner: community (fail closed)" | null, a throw (logged `[scheduler] owner failed: …`) and a muted owner all spawn `false`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "without loadOwner the owner given at start is used (existing callers keep working)" | `true` with only `owner`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "an owner schedule on a non-git project keeps its own scoped folder, never the project folder itself" | cwd `scoped-talk-schedule_…`, not the project dir; `actingIsAdmin: true`. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the owner's schedule resolves owner (the shell gate still refuses a scheduled run); a team member's resolves community" | The real spawn client's child reports role `owner`, stamps `1` / `owner` / `schedule`, session `schedule_<id>`, shell "scheduled runs never get them"; the team member's child `community` / `0` / `community`. |
| `REQ-plugins-065` | same test | The child's `resolveActingRole` gives `owner` for the owner's schedule and `community` for a team member's. |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "denied: the card was raised for the exact post, nothing was posted, and the run ends blocked with a stuck ask naming it" | One `mustask-post` card with the exact text and the owner as requester; post refused; next call unrun; one model request; `blocked`, no verify; the stuck question text; the operator line. |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "no answer in time (lapsed): a no too — the run ends blocked with a stuck ask saying nobody answered" | `blocked`, stuck, "nobody answered Approve card … in time (SAFE-20: no answer means no)". |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "outside a schedule (the owner's own chat) a denied card leaves the run going: the model sees the refusal, no ask" | Post refused, no ask, `done`, two model requests. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "another person's schedule never reaches the card: the post is not offered and refused for the role" | Not offered, no card, the role refusal, no ask. |
| `REQ-discord-741`, `REQ-plugins-101`, `REQ-discord-476` | `tests/scheduler.owner-role.test.ts` › "the owner's schedule is the owner, but it still has no private place: …" | With the owner's schedule stamps and no reply channel: `memory-store` / `memory-recall --project` work; `memory-recall --category private`, `--person` and `memory-profile` are refused ("never in a schedule") with no `privateText`; `discord-send-file` passes the role check and is refused "no Discord conversation for this run". A guard (passes on both); a mutation that treats a schedule as a conversation fails it. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "the scheduler records that ask: the schedule waits, and the next due tick runs nothing and raises no new card" | First tick: one run, one card, open stuck ask naming the tool, one post pinging the owner with controls; next two due ticks skipped, no run, still one card, one wait note. |
| `REQ-agent-741` | `tests/scheduler.owner-role.test.ts` › "denied, lapsed and a resent deny give a stuck ask naming the tool, the why, the rule and the card", "anything else is not: …", "a long why is cut; secrets in it are scrubbed" | Exact question for `denied`; the lapse and resent wording; null for a call that ran, `worker` / `no-owner` / `unavailable` / `aborted` and plain failures; a long why cut, a token scrubbed. |
| `REQ-cli-741` | `tests/scheduler.owner-role.test.ts` › "daemon: the owner's schedule runs as the owner; after the file names another owner, the next run is community" | `[true]`, then `[true, false]` after rewriting `[owner]`, no restart. |
| `REQ-discord-741` | `tests/scheduler.owner-role.test.ts` › "bridge: the owner's schedule runs as the owner; after the file names another owner, the next run is community" | Same through `startBridge`'s scheduler. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` › "the owner's own schedule (owner stamp) is owner; a schedule is never team, whatever its stamp" | Owner stamp ⇒ `owner`; a team member with community, team or owner stamp ⇒ `community` in a `schedule_*` session; team stamp in `sess_*` ⇒ `team`. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` › "runPlugin: the owner's schedule passes the role gate for mutating tools; a team member's schedule gets the role refusal even for a team review tool" | Owner: `github-issue-comment` (dry run) and `files-write` run; team: role refusal, exit 2. |
| `REQ-plugins-065` | `tests/roles.team.test.ts` › "the catalog: the owner's schedule is offered its allowlisted owner tools (never the shell); a team member's schedule no mutating tool" | Owner catalog has `github-issue-comment`, `github-pr-create`, `files-write`, not `shell-exec`; team catalog no mutating tool. |
| `REQ-agent-741` | `tests/agent.allowlisted-dangerous.test.ts` › "the owner's own scheduled run (owner stamp, schedule session and surface) never discovers or spawns fledge; …" | `github-pr-review` and `files-delete` offered; `shell-exec` not; only the Fledge core reads; `fledge-hello` never registered; no `calls.log`; the call refused as not offered. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
- `specs/plugins/context.md`
- `specs/cli/context.md`
