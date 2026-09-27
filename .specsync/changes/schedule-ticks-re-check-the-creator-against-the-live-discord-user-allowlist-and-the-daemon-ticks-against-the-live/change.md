---
id: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
state: implementing
type: bug_fix
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# Schedule ticks re-check the creator against the live Discord user allowlist, and the daemon ticks against the live allowlist (DISCORD-SCHEDULE-3)

## Intent

Schedule ticks re-check the creator against the live Discord user allowlist, and the daemon ticks against the live allowlist (DISCORD-SCHEDULE-3)

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- A schedule whose creator is deny-listed, or missing from a non-empty Discord user/role allowlist and not the configured owner, is refused at tick in the bridge and the daemon: no worktree, no agent run, no post, recorded failed ('creator not allowlisted: ...') and counted toward the 5-failure auto-pause; a creator deny-listed mid-run gets no post; the owner and listed users still run and empty user/role lists stay channel-gated; the daemon re-reads the allowlist before each tick, so a channel removed or a user deny-listed in the file after start is refused on the next tick, and an unloadable file skips the tick with 'tick.allowlist_failed' (fail closed; due schedules stay due); tests/scheduler.actor-gate.test.ts and tests/daemon.test.ts cover this and fail on origin/main

## No-spec Rationale

Not applicable
