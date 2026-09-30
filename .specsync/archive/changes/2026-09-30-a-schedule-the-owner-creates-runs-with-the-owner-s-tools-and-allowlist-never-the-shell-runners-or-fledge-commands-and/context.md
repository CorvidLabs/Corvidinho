---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: context
---

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
