# Lesson bundle — schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Schedule ticks re-check the creator against the live Discord user allowlist, and the daemon ticks against the live allowlist (DISCORD-SCHEDULE-3)
- **Kind**: BugFix
- **Specs**: discord, cli
- **Paths**: src/scheduler/service.ts, src/daemon/daemon.ts, tests/scheduler.actor-gate.test.ts, tests/daemon.test.ts, docs/DAEMON.md, docs/discord.md, specs/discord/discord.spec.md, specs/cli/cli.spec.md
- **Acceptance**: A schedule whose creator is deny-listed, or missing from a non-empty Discord user/role allowlist and not the configured owner, is refused at tick in the bridge and the daemon: no worktree, no agent run, no post, recorded failed ('creator not allowlisted: ...') and counted toward the 5-failure auto-pause; a creator deny-listed mid-run gets no post; the owner and listed users still run and empty user/role lists stay channel-gated; the daemon re-reads the allowlist before each tick, so a channel removed or a user deny-listed in the file after start is refused on the next tick, and an unloadable file skips the tick with 'tick.allowlist_failed' (fail closed; due schedules stay due); tests/scheduler.actor-gate.test.ts and tests/daemon.test.ts cover this and fail on origin/main

## Evidence

- Verification commit: `f1682aabee789a5e32ffee43d81d51f0e4f27f07`
- Base commit: `fc0ed8da6e47dc1db452ee51044cde096db4e8bc`
- Verified by: `specsync check --spec cli --spec discord`

## From the change's context.md

# Context

Captured HI (`hi/discord.md`, not retired): **DISCORD-SCHEDULE-3** "Schedule
ticks respect existing channel/user allowlists and SAFE gates; a schedule
cannot post or act outside channels/repos I already allow." Issues #102, #105
(their COS-* ids are drafts and are not used here).

Gap on origin/main (fc0ed8d), found in the w9 scoping pass:

- The **user** allowlist was never checked at tick time. `SchedulerService.runOne`
  ran and posted as `schedule.createdByUserId` after a channel check only,
  without the ingress actor gate `gateActor` (REQ-discord-201). Repro: a
  schedule by `creator-1` in `chan-ok` with `channels=["chan-ok"]` and
  `denyUsers=["creator-1"]` (or `users=["someone-else"]`, creator not the
  owner): one `tick()` ran the agent once and posted to `chan-ok`, while a
  live message from that user is refused. REQ-discord-020 had narrowed the HI
  to "re-check channel allowlists".
- `corvidinho daemon` loaded the allowlist once at start and never again, so
  after `/admin channels remove` (or users/deny edits) in the bridge rewrote
  the file, a running daemon kept running the removed channel's schedules
  until restart. It also passed no `owner` to `SchedulerService`.

Already met on main (kept): channel re-check before the run and before the
post, project re-resolve at tick (REQ-discord-202), ADMIN-only create,
non-interactive non-ADMIN spawns (SAFE-1 / ROLES-CHAT-3), per-run worktrees.

Constraints: no new env var, config key, slash command or option; no SQLite
schema bump; no ACCESS/bounty/MainNet surfaces. Mutes stay in-memory in the
bridge and are not part of the tick gate. Left out on purpose (question for
Leif): schedule runs spawn non-ADMIN, so their GitHub *read* tools use the
ROLES-CHAT-8 community path for public repos outside the GitHub allowlist;
writes are already refused.

## From the change's design.md

# Design

- `src/scheduler/service.ts`: new private `gateTick(schedule)` —
  `gateActor({ userId: createdByUserId, allowlist: this.allowlist, owner:
  this.owner })`, then `checkChannel` when `channelId` is set. Refusal
  text: `creator not allowlisted: <scrubbed gate error>` (no user id) or the
  existing `channel not allowlisted: <channel id>`.
  - `runOne` calls it first (replacing the channel-only block): a refusal is
    `finish(ok:false)` before any worktree or agent spawn, so it counts
    toward `FAILURE_AUTO_PAUSE` exactly like a channel refusal.
  - The post path uses `gateTick` instead of `checkChannel`, so a creator
    refused mid-run gets no post (and, as for a channel, the pending spend
    warning / owner ping stay unclaimed).
- `src/daemon/daemon.ts`:
  - `daemonGate(allowlist, env)` helper: the start-time gate shape
    (`mergeChannelIds` for channels), reused per tick.
  - Start loads `owner = (await loadOwnerConfig({ env })).owner` once
    (same as the bridge's `config.owner`) and passes it to
    `SchedulerService`.
  - Each `tick()` first calls `tryLoadAllowlist({ env })`; failure →
    `log("error", "tick.allowlist_failed", { error })` and return an empty
    tick (fail closed; claims nothing, so due schedules stay due). Success →
    assign `sourcePath`, `github`, `discord` on the shared gate object
    in place, then `scheduler.tick()`.
- No change to the bridge wiring (it already shares the live allowlist and
  owner). No new env var, config key, option, slash command or schema change.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-020` | `tests/scheduler.actor-gate.test.ts` | "a deny-listed creator's schedule is refused at tick: no agent run, no post" (`creator not allowlisted: …`, 1 consecutive failure); "a creator not on a non-empty user allowlist is refused; listed users and the owner still run"; "the configured owner on the deny list is refused (deny wins)"; "a creator deny-listed while the run is in flight gets no post"; "refused creator ticks count toward the auto-pause". All five fail with origin/main's `src/scheduler/service.ts` (agent runs and posts) and pass on the branch. Guard that passes on both: "empty user and role lists stay channel-gated: an unlisted creator still runs". |
| `REQ-discord-020` | `tests/scheduler.service.test.ts`, `tests/discord.schedule.test.ts`, `tests/worktree.project-scope.test.ts` | Existing channel re-check, non-blocking tick, create gates and tick project scope tests still pass. |
| `REQ-cli-108` | `tests/daemon.test.ts` | "a channel removed from the allowlist file after start is refused on the next tick", "a creator deny-listed in the file after start is refused on the next tick", "a malformed allowlist file skips the tick: no run; the schedule stays due" (`tick.allowlist_failed`, then runs once fixed), "a creator missing from a non-empty user list (not the owner) is refused": all four fail with origin/main's `src/daemon/daemon.ts` + `src/scheduler/service.ts` and pass on the branch. "the owner's schedule still ticks when the user list is non-empty and omits the owner" passes on both and guards the owner wiring. "a tick still re-reading the allowlist when stop begins claims no run" guards the reload await against shutdown (it fails without the `stopRequested` check: the second schedule is claimed after the drain started and is abandoned). The 13 earlier daemon tests still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `fledge lanes run verify --non-interactive` green.

## Where these lessons go

- `specs/discord/context.md`
- `specs/cli/context.md`
