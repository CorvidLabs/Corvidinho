# Lesson bundle — discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord project option stays inside the bridge project root or an allowlisted sibling repo checkout (ALLOW-2, ALLOW-6, SAFE-3, DISCORD-SCHEDULE-3)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/worktree/manager.ts, src/discord/session-store.ts, src/discord/bridge.ts, src/scheduler/service.ts, src/discord/command-handlers/schedule.ts, tests/worktree.project-scope.test.ts, tests/discord.session-worktree.test.ts, tests/discord.schedule.test.ts, specs/discord
- **Acceptance**: A /work, /session start or /schedule project that is an absolute path, ../ traversal or symlink outside the bridge project root is refused with not authorized before any worktree, talk branch or agent run; a sibling checkout runs only when its origin OWNER/REPO passes the GitHub repo allowlist (deny wins, empty = deny); schedule ticks re-check the same rule

## Evidence

- Verification commit: `9a68acd0e86ec9956365f908089aa9cb5311c8a4`
- Base commit: `65cff62fdae8cb0413d92adfe8acb29455fc127f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

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

## From the change's design.md

# Design

One scope gate inside `resolveProjectDir` (src/worktree/manager.ts), so
`/work`, `/session start`, the session store, `/schedule create` and schedule
ticks all share it:

- Empty project → bridge project root (unchanged).
- A path lexically outside the root and outside its parent's direct children
  is refused before any disk probe (no existence oracle for host paths).
- The resolved directory's real path (symlinks followed) must be inside the
  real bridge root, or be a direct child of the root's parent (a sibling
  checkout) that is the top of its own git checkout and whose `origin`
  OWNER/REPO passes the existing GitHub repo allowlist (`isRepoAllowed`: deny
  wins, empty allow = deny). No allowlist supplied ⇒ refused.
- Refusals read `not authorized: …`; nothing is created.

Wiring: `ResolveProjectOptions.github`; `SessionStoreOptions.allowlist`
(bridge passes `config.allowlist`); `SchedulerService.runOne` passes
`this.allowlist.github`; `/schedule create` runs the same resolve before
storing. `bindWorktree` on an already-bound talk now refuses a project that
does not resolve instead of ignoring it. No new env var, config key, slash
command or option. ADMIN-only non-default projects left out (not in hi/).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-202` | `tests/worktree.project-scope.test.ts` | absolute path, `../` traversal, symlink escape and `/` refused with not authorized; sibling needs an allowlisted origin (deny wins, no allowlist = deny, plain dir refused); non-admin `/work` and `/session start` with the private repo run no agent and leave no session, talk branch or worktree in it; an allowlisted sibling still runs in its own worktree; `/schedule create` refuses and stores nothing; a stored out-of-scope schedule tick fails not authorized with no agent run. 4 of 6 failed before the fix, 6 of 6 pass after. |
| `REQ-discord-022` | `tests/discord.session-worktree.test.ts`, `tests/discord.schedule.test.ts`, `tests/worktree.test.ts` | an explicit allowlisted sibling project still freezes; a mid-talk switch is still refused; default-root and in-root projects unchanged. |

## Where these lessons go

- `specs/discord/context.md`
