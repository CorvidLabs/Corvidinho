---
module: discord
change: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
---

# Delta — discord (project option scope)

## Added

### REQUIREMENT REQ-discord-202

A project picked from Discord — the optional `project` of `/work` and
`/session start`, the `project` of `/schedule create`, and a stored
schedule's project at tick time — SHALL resolve only to the bridge project
root, a directory inside it, or a sibling checkout (a direct child of the
root's parent directory) that is the top of its own git checkout and whose
`origin` OWNER/REPO passes the GitHub repo allowlist (deny wins; empty allow
or no allowlist ⇒ refuse) (ALLOW-2 / ALLOW-6 / SAFE-3 / DISCORD-SCHEDULE-3).
Containment SHALL be checked on real paths so absolute paths, `..`
traversal and symlinks cannot leave that set, and a path lexically outside it
SHALL be refused before any disk probe. A refused project SHALL get a short
`not authorized` reply and SHALL create no session, worktree, `talk/*`
branch, schedule or agent run. No new env var, config key, slash command or
option.

Acceptance Criteria
- `/work` or `/session start` with an absolute path or `../` traversal to another repo on the host is refused; no agent run, session, worktree or talk branch.
- A symlink inside the bridge root that points outside it is refused.
- A sibling checkout runs only when its origin passes the GitHub repo allowlist; a denied, unlisted or non-git sibling is refused.
- `/schedule create` refuses such a project and stores nothing; a stored schedule with such a project fails its tick without running the agent.
- Empty project, the bridge root and directories inside it behave as before.
