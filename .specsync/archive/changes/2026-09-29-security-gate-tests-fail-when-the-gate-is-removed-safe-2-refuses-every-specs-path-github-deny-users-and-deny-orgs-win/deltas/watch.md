---
module: watch
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
---

# Delta: watch (deny_users and deny_orgs win at the router)

## Modified

### REQUIREMENT REQ-watch-003

Every event SHALL pass repo + user allowlist gates before session spawn (ALLOW-1/2). Denied contacts SHALL refuse quietly with no session (ALLOW-5).

Acceptance Criteria
- Non-allowlisted user/repo → kind refuse/ignore; SessionStore unchanged.
- A user on `deny_users` is refused (`user_not_allowlisted`, the not-authorized reply) even when the user allow list also names them, and no session starts; an allowlisted user who is not denied still starts one.
- A repo whose owner is on `deny_orgs` is refused (`repo_not_allowlisted`) even when the repo allow list names it, and no session starts.
- Both deny tests fail when the matching deny check is removed from `isGithubUserAllowed` / `isRepoAllowed`.
