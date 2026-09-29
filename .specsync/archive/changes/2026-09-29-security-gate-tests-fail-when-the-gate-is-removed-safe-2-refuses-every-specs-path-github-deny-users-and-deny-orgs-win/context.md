---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: context
---

# Context

A QA audit of `origin/main` (246cb6c; re-checked on 0f2e2c2, after #233) mutated each
security gate and ran the full suite. Four gates could be removed with the
whole suite still green (2085 pass, 0 fail), so nothing proved they held:

1. SAFE-2 `specs/` component rule (`plugins/files/protectedPaths.ts`,
   `if (lower === "specs") return true;`). Every `specs/` target in the tests
   ended in `.spec.md`, which the basename rule also covers, so
   `specs/<m>/requirements.md`, `context.md` and `tasks.md` had no test
   (REQ-plugins-083 / REQ-plugins-182).
2. GitHub `deny_orgs` / `deny_users` loops in `src/allowlist/github.ts`
   (`isRepoAllowed`, `isGithubUserAllowed`), the only deny checks on WATCH
   ingress, `git-push` and the sibling-project gate. Tests covered only
   `deny_repos`; the `evilorg` cases passed because evilorg was not allowed,
   or went through `checkRepoGateForActingRole`'s own copy of the org check
   (REQ-plugins-004 / 005, REQ-watch-003).
3. ROLES-CHAT-8 private-repo refusal through the real visibility lookup
   (`createOctokitVisibilityLookup` in `src/plugins/githubPublic.ts`). Every
   community test injected `visibilityLookup`, so a lookup that always
   answered "public" passed.
4. DISCORD-8 live requester check (`verifyRequesterCanSend`'s
   `permissionsFor(member).has([ViewChannel, SendMessages])`). The tests
   asserted `evaluateRequesterCanSend`, which no product code calls, and every
   post test injected a checker (REQ-discord-012).

Leif's 2026-09-28 interview (Wave 0: spec/test hardening, no new criteria):
add the missing assertions as tests, prove each one matters by breaking the
gate and seeing it fail, then restore; if a new test fails on main, the gate
is broken and gets fixed in the same PR. None failed on main, so product code
is unchanged. No hi criteria are captured (none are new).
