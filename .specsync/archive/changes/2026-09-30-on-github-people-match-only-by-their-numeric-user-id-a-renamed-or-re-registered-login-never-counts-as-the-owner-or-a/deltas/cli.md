---
module: cli
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
---

# Delta — cli (doctor warns about GitHub logins without a numeric id)

## Added

### REQUIREMENT REQ-cli-367

`corvidinho doctor` SHALL warn about GitHub logins with no numeric id
(IDENTITY-7.a, #36, REQ-discord-367). From the owner config (env + allowlist
file `[owner]`) and the declared people of the allowlist file the loader
resolves (read like the bridge and WATCH read them), doctor SHALL print one
`[warn] people-github` line when the owner or any declared person has a GitHub
login but no GitHub numeric id (`peopleWithoutGithubId`), naming them by
person id only (`the owner` for the built-in owner, `<id> (the owner)` for the
owner's declared person) — never a Discord id, GitHub id, login or token —
and saying that on GitHub people match only by that id, so they read as
undeclared (community) there until one is linked (`[owner] github_id` /
`github_ids` in the file, or `/admin people link person:<id> github:<login>`).
The line SHALL NOT change the exit code, and SHALL NOT be printed when nobody
is affected.

Acceptance Criteria
- An allowlist file whose `[owner]` has a `github_login` but no `github_id` and a person with only `github_logins` gives `[warn] people-github: ada, the owner: …` naming person ids only; no Discord id, GitHub id or login is printed; doctor still passes (exit 0).
- With `[owner] github_id` and `github_ids` on everyone with a login there is no `people-github` line.
- The tests in `tests/cli.doctor-truth.test.ts` fail on the base sources and pass after.
