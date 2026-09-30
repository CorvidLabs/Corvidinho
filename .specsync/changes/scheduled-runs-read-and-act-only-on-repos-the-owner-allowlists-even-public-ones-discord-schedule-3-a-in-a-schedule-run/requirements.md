---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: requirements
---

# Requirements

Captured HI met (captured on main in `hi/discord.md` from Leif's 2026-09-28
interview, round 10; no `hi/` edits in this change):

- **DISCORD-SCHEDULE-3.a**: "Scheduled runs read and act only on repos I
  allowlist, even public ones."

Canonical requirements changed (see deltas):

- Added **REQ-plugins-496**: the schedule-run marker
  (`SCHEDULE_SESSION_PREFIX`, `isScheduleRunEnv`, inherited by workers); in
  a schedule env the GitHub repo gate refuses a repo off the GITHUB-6
  allowlist for every role with no visibility lookup (role rules still apply
  on top), covering every `github-*`, review and docs / milestone reader;
  `web-fetch` refuses GitHub-host hops (first and every redirect) that do not
  name an allowlisted OWNER/REPO.
- Modified **REQ-plugins-065** (role gate): the schedule-run allowlist step
  before the role rules.
- Modified **REQ-plugins-493** (community public path): refused before any
  visibility lookup in a scheduled run.
- Modified **REQ-plugins-111** (web-fetch): the per-hop GitHub rule in a
  scheduled run; the handler passes the run's env.
- Modified **REQ-discord-202** (project scope): for `/schedule create` and
  every tick, a checkout nested inside the bridge root needs an allowlisted
  origin.
