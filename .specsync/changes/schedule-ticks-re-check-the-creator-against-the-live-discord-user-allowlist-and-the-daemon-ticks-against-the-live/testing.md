---
change: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-020` | `tests/scheduler.actor-gate.test.ts` | "a deny-listed creator's schedule is refused at tick: no agent run, no post" (`creator not allowlisted: …`, 1 consecutive failure); "a creator not on a non-empty user allowlist is refused; listed users and the owner still run"; "the configured owner on the deny list is refused (deny wins)"; "a creator deny-listed while the run is in flight gets no post"; "refused creator ticks count toward the auto-pause". All five fail with origin/main's `src/scheduler/service.ts` (agent runs and posts) and pass on the branch. Guard that passes on both: "empty user and role lists stay channel-gated: an unlisted creator still runs". |
| `REQ-discord-020` | `tests/scheduler.service.test.ts`, `tests/discord.schedule.test.ts`, `tests/worktree.project-scope.test.ts` | Existing channel re-check, non-blocking tick, create gates and tick project scope tests still pass. |
| `REQ-cli-108` | `tests/daemon.test.ts` | "a channel removed from the allowlist file after start is refused on the next tick", "a creator deny-listed in the file after start is refused on the next tick", "a malformed allowlist file skips the tick: no run; the schedule stays due" (`tick.allowlist_failed`, then runs once fixed), "a creator missing from a non-empty user list (not the owner) is refused": all four fail with origin/main's `src/daemon/daemon.ts` + `src/scheduler/service.ts` and pass on the branch. "the owner's schedule still ticks when the user list is non-empty and omits the owner" passes on both and guards the owner wiring. The 13 earlier daemon tests still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `fledge lanes run verify --non-interactive` green.
