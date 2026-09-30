---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: context
---

# Context

DISCORD-SCHEDULE-3.a is captured on main (`hi/discord.md:40`, nested under
DISCORD-SCHEDULE-3) from Leif's 2026-09-28 interview, round 10: "Scheduled
runs read and act only on repos I allowlist, even public ones." Round 10's
note: "schedules read and act on allowlisted repos only; public
non-allowlisted repos refused". No `hi/` edits in this change.

What main did (M3/M4 synthesis, slice `schedules-owner`, part A):

- Every schedule run is stamped community (`actingIsAdmin: false`), and
  `checkRepoGateForActingRole` lets community read any repo confirmed public
  (ROLES-CHAT-8, REQ-plugins-065 / -493). So a schedule could read
  `torvalds/linux` through `github-pr-list`, the review readers or the docs
  readers. `delegate` / `council` workers inherit
  `CORVIDINHO_DISCORD_SESSION_ID` and take the same path.
- REQ-discord-202 limits a schedule's project to the bridge root, a directory
  inside it, or an allowlisted sibling checkout, but any directory inside the
  root was accepted without an origin check: a clone of a non-allowlisted repo
  placed under the root became a schedule's worktree.
- `web-fetch` is dangerous, so community schedules never get it today; once
  owner schedules get allowlisted tools (DISCORD-SCHEDULE-1.a) it could reach
  GitHub hosts.

Constraints: specs only through SpecSync; v1 off-chain; no new env var or
config key; #232 / #233 and the forget card, approvals and bridge chat paths
are other PRs' scope and are not touched. DISCORD-SCHEDULE-1.a (owner
schedules as owner) and AUTONOMY-6.a (blocking schedule asks) are later
slices that build on the marker added here.
