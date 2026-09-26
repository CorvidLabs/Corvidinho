---
change: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
artifact: design
---

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
