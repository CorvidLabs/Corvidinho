---
id: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
state: implementing
type: feature
base_commit: 0f2e2c2774635d1dcbdff599cba92dbecf8eebd9
---

# Security gate tests fail when the gate is removed: SAFE-2 refuses every specs/ path, GitHub deny_users and deny_orgs win in WATCH and git-push, a community session is refused a private repo through the real visibility lookup, and the live DISCORD-8 requester check is exercised

## Intent

Security gate tests fail when the gate is removed: SAFE-2 refuses every specs/ path, GitHub deny_users and deny_orgs win in WATCH and git-push, a community session is refused a private repo through the real visibility lookup, and the live DISCORD-8 requester check is exercised

## Affected Canonical Specs

- `plugins`
- `watch`
- `discord`

## Acceptance Criteria

- files-write/edit/delete of specs/<m>/requirements.md, specs/<m>/context.md and a new specs/notes.md are refused with SAFE-2 (exit 2) and git-commit refuses staging the deletion of specs/x/requirements.md, and these tests fail with the specs/ component rule removed; a WATCH event from a deny_users user or a deny_orgs org is refused with no session and git-push to a deny_orgs org exits 3 with nothing pushed, and these tests fail with either deny loop disabled; a community session with no injected visibility lookup is refused a private repo (no pulls call), refused an unconfirmed one (404 or no token) and allowed a public one through the Octokit lookup over a stubbed fetch, and the private test fails when the lookup always answers public; verifyRequesterCanSend with no injected checker refuses (403) a requester without View Channel + Send Messages, allows one with both, needs Attach Files for a file post, and discord-post-message in a bridge run posts nothing on a live denial, and these tests fail with the permissionsFor checks disabled; product code is unchanged

## No-spec Rationale

Not applicable
