---
id: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
state: archived
type: feature
base_commit: 61fbe1698da739fe1e05a104ce6411adde224a05
---

# On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36)

## Intent

On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36)

## Affected Canonical Specs

- `discord`
- `watch`
- `cli`
- `plugins`
- `agent`

## Acceptance Criteria

- IDENTITY-7.a (captured in this PR from Leif's 2026-09-28 interview, round 12): on GitHub a person, the owner included, matches only by numeric user id; resolvePerson and memorySubjectForGithub never match a GitHub login, so a renamed or re-registered login with another numeric id (or an event with no id) resolves undeclared (community) in the WATCH identity block, the WATCH memory inject and the memory plugins, and is not exempt from the SAFE-13 injection guard, while the declared numeric id matches whatever the login now is; [owner] github_id (TOML or JSON) declares the owner's GitHub id and joins the owner's person, and isOwnerGithub matches that id only; /admin people link github:<login> looks the login's numeric id up once through the GitHub API (owner-only, audited as today) and stores it in github_ids next to the login, a failed or mismatched lookup links nothing and is audited as an error; people entries with only github_logins keep loading and matching on Discord but not on GitHub, and corvidinho doctor prints [warn] people-github naming them by person id only; the live Octokit search client maps user.id to DetectedEvent.senderId; tests/identity.github-numeric-id.test.ts, tests/watch.github-numeric-id.test.ts and the doctor test fail on the base sources and pass after

## No-spec Rationale

Not applicable
