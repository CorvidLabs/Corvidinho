# Lesson bundle — schedule-ask-outbox-delivery-re-checks-the-creator-and-channel-against-the-live-discord-schedule-3-gate

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Schedule ask outbox delivery re-checks the creator and channel against the live DISCORD-SCHEDULE-3 gate
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/scheduler/service.ts, tests/scheduler.ask-outbox.test.ts
- **Acceptance**: A daemon-claimed schedule ask is delivered only while the creator and channel pass the live DISCORD-SCHEDULE-3 gate; a refused one stays pending and posts once allowed again; regression test fails with the channel-only check

## Evidence

- Verification commit: `a0cb52cde300feebabd3946b9aa6d1f34ba402ca`
- Base commit: `c8988b98e0d872847a16f711cde337277a027b66`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Captured HI (`hi/discord.md`): **DISCORD-SCHEDULE-3** "Schedule ticks respect
existing channel/user allowlists and SAFE gates; a schedule cannot post or act
outside channels/repos I already allow." Also AUTONOMY-2 / AUTONOMOUS-7 (the
needs-human outbox this PR adds, REQ-discord-347).

Found while merging origin/main (#236, `gateTick`) into this branch: the
in-process post now goes through `gateTick` (creator + channel), but the
new delivery pass for daemon-claimed asks (`deliverPendingAsks`) still
checked only the channel. Repro: a daemon stuck run for a schedule whose
creator is then removed from a non-empty user list (or deny-listed) is still
posted by the bridge's next tick, pinging as that schedule, while a live
message from that creator, and a bridge-run post of the same schedule, are
refused.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | "a creator the live allowlist no longer lists gets no post; the ask stays pending until they are back (DISCORD-SCHEDULE-3)": with the bridge's user list `["someone-else"]`, then the creator listed but deny-listed, the daemon's stuck ask is not posted and `ask_posted_at` stays null; clearing the deny list in place posts it once with the owner ping. Fails with the channel-only check in `deliverPendingAsks` (1 post on the first tick) and passes with `gateTick`. The other 17 outbox tests still pass. |
| `REQ-discord-020` | `tests/scheduler.actor-gate.test.ts`, `tests/daemon.test.ts` | The tick gate tests from #236 still pass on the merged branch. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `fledge lanes run verify --non-interactive` green.

## Where these lessons go

- `specs/discord/context.md`
