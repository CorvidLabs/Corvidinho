---
change: a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and
artifact: requirements
---

# Requirements

- DISCORD-SCHEDULE-1.a (captured on main, Leif 2026-09-28 interview): "A
  schedule I create runs with my tools and my allowlist (still never the
  shell or runners, SAFE-3.a) and asks me through Approve cards where the
  must-ask list says so; schedules other people create stay read-only."
  Nothing new captured.
- Decisions from the interview record and the schedules-owner rows of
  `m34-defaults.md`: owner schedules get no discovered Fledge plugin commands;
  a must-ask deny or lapse is a no and the run ends with a blocking
  AUTONOMY-6.a ask naming the refused action, so later ticks wait instead of
  a new card each tick; the schedule's own configured-channel posts are not
  AUTONOMY-10 announcements, but a `discord-post-message` the model starts in
  a schedule run goes through the must-ask gate; owner schedules on a non-git
  project keep a separate scoped folder (Leif round 13).
- Kept (must not regress): SAFE-3.a (the shell gate refuses the `schedule`
  surface), DISCORD-SCHEDULE-3 / 3.a (creator and channel gate, repo gate),
  SAFE-12 / SAFE-13 (fence and scan of non-owner schedule text), AUTONOMY-6.a
  (blocking schedule asks), IDENTITY-9..12 (roles re-resolved in the tool
  layer), SAFE-20 (no answer is no), SAFE-1 / SAFE-5.
- Added: REQ-discord-741 (live owner, the owner stamp only for the owner's
  own schedule, the ask that blocks), REQ-agent-741 (no Fledge discovery in a
  scheduled run; `mustAskRefusedAsk` ends a scheduled run on a no),
  REQ-cli-741 (the daemon's live owner loader).
- Modified: REQ-plugins-065 (a scheduled run is owner or community, never
  team), REQ-discord-713 (runs are no longer always `actingIsAdmin: false`;
  the creator's role uses the live owner).
- No env var, config key, flag, slash option, table or schema version.
