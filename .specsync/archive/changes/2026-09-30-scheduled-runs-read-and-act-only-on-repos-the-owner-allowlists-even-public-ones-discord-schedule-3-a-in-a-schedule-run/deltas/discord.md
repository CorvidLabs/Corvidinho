---
module: discord
change:
scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
---

# Delta: discord (DISCORD-SCHEDULE-3.a: a schedule's nested checkout needs an allowlisted origin)

## Modified

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
For `/schedule create` and every tick (`resolveProjectDir` option `schedule:
true`; not `/work`, `/session start` or start-up recovery) a directory inside
the bridge root that lies in a git checkout nested there — its `git rev-parse
--show-toplevel`, on real paths, is inside the root and is not the root —
SHALL resolve only when that checkout's `origin` OWNER/REPO passes the GitHub
repo allowlist (deny wins; no origin, or no allowlist ⇒ refused), so a
schedule never reads a repo off the allowlist through a clone placed under the
root (DISCORD-SCHEDULE-3.a); the root's own checkout (or one enclosing it) and
plain folders are unchanged. A stored schedule on such a checkout SHALL fail
its tick like any refused project (REQ-discord-353).

Acceptance Criteria
- `/work` or `/session start` with an absolute path or `../` traversal to another repo on the host is refused; no agent run, session, worktree or talk branch.
- A symlink inside the bridge root that points outside it is refused.
- A sibling checkout runs only when its origin passes the GitHub repo allowlist; a denied, unlisted or non-git sibling is refused.
- `/schedule create` refuses such a project and stores nothing; a stored schedule with such a project fails its tick without running the agent.
- Empty project, the bridge root and directories inside it behave as before.
- A schedule's project in a checkout nested in the bridge root whose origin is off the allowlist (or missing), or in a folder inside that checkout, is refused at `/schedule create` (nothing stored) and at a stored schedule's tick (no agent run, worktree or talk branch), while `/work` still accepts it; an allowlisted nested checkout, the root and plain folders still resolve for a schedule (`tests/worktree.project-scope.test.ts`).
