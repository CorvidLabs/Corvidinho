---
change: every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and
artifact: context
---

# Context

Issue #102 (M5 Chief of staff, build step 2 of 7): "COS: daily briefing DM to
Leif and each teammate". Leif chose "routines first: daily briefing (DM to
Leif and each teammate)"; Corvidinho is chief of staff for the entire team
and remembers each person.

HI: COS-1, COS-2 (as drafted in #102) and COS-2.a were confirmed in Leif's
2026-09-28 interview record (round 17, 2026-10-07) and are captured in this
change's PR with `hi` into a new family file, `hi/cos.md` (first commit).
Related criteria already on main: IDENTITY-10 (team gets work tasks,
reviews, only their own memory and briefings), AUTONOMOUS-4 and
DISCORD-SCHEDULE-1..5 (the scheduler this hangs on), AUTONOMY-8 / 8.a (ask
at the spend cap, worst-case reserve), SAFE-6 (scrub), SAFE-12 (external
text is data), MEMORY-ACL (a person's things are theirs), IDENTITY-7.a
(GitHub matches numeric ids only).

Scope from #102 and the interview: one DM per person per working day, built
from GitHub (their PRs / issues / review requests), the work queue and the
schedules; skipped on days with nothing to say; owner and team only. Out:
public posts, nightly health reports. Settled rules kept: specs only via
SpecSync; owner admins and the team works; v1 off-chain (no AlgoChat /
wallet / MainNet surface); self-merge only in Corvidinho; ask at the spend
cap. #232 / #233 scope untouched. The parallel AUTONOMOUS-7.a PR (daemon REST
DM path) is not depended on: only the bridge sends briefings.

What was missing on main (85871fa4): no briefing of any kind; the declared
people list had no time zone or working hours; the `/admin people add`
command could set only a display name.
