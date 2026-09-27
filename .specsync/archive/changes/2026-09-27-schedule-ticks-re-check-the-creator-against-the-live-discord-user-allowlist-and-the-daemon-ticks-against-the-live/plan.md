---
change: schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live
artifact: plan
---

# Plan

1. Re-check the gap on current origin/main (fc0ed8d): the scheduler has no
   actor gate; the daemon loads the allowlist once and passes no owner.
2. Write regression tests: `tests/scheduler.actor-gate.test.ts` (service)
   and a "live allowlist and creator gate" block in `tests/daemon.test.ts`.
3. Implement `gateTick` in the scheduler and the per-tick reload + owner in
   the daemon.
4. Prove the new tests fail with main's `service.ts` / `daemon.ts` swapped
   in and pass on the branch.
5. Docs (`docs/DAEMON.md`, `docs/discord.md`), spec invariants/error
   cases, spec files list, module testing notes, deltas (Modified
   REQ-discord-020, REQ-cli-108).
6. `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
