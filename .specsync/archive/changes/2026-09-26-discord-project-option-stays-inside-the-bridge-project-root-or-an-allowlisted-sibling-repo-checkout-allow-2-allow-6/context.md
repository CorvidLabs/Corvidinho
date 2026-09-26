---
change: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
artifact: context
---

# Context

Bug hunt finding discord-2 (high). The optional `project` of `/work` and
`/session start` (and the required `project` of `/schedule create`) went raw
into `resolveProjectDir`, which accepted any existing absolute path or a
`../` traversal from the bridge root with only an existence check. A
non-admin member of an allowlisted channel could run
`/work project:/home/leif/private-repo` (or `../../home/leif/private-repo`):
the bridge made a `talk/sess_*` branch and a git worktree of that unrelated
repo and ran the agent with that checkout as cwd and SAFE-3 root. Schedule
ticks resolved `schedule.project` the same way with no repo allowlist check.
Violates ALLOW-2, ALLOW-6, SAFE-3 (root chosen by an untrusted actor) and
DISCORD-SCHEDULE-3.
