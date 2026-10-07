---
id: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
state: approved
type: feature
base_commit: 54d6a6c777f51b4fa430511a5d7f049a8ba42083
---

# ADMIN-3.c part 1: as owner I can change the deny lists and the GitHub repo allow lists with /admin deny and /admin github; every change is audited and github watch re-reads the allowlist every poll

## Intent

ADMIN-3.c part 1: as owner I can change the deny lists and the GitHub repo allow lists with /admin deny and /admin github; every change is audited and github watch re-reads the allowlist every poll

## Affected Canonical Specs

- `discord`
- `watch`

## Acceptance Criteria

- ADMIN-3.c (captured on main from Leif's 2026-09-28 interview, round 10; this is part 1 — mutes are part 2, so ADMIN-3.c stays partial) holds for the deny lists and the GitHub repo allow lists: the owner-only /admin deny add|remove takes exactly one of channel, user, role (ROLE option), github_org, github_repo or github_user and edits [discord].deny_channels|deny_users|deny_roles or [github].deny_orgs|deny_repos|deny_users; /admin github add|remove takes exactly one of org or repo and edits [github].orgs|repos; both re-check the owner at handler time, validate input (snowflakes, GitHub logins or numeric ids, OWNER/REPO or OWNER/*), refuse env-only entries on remove, refuse an allow add a deny list covers, and never let the owner lock themselves out (their Discord id, a role they hold here or @everyone, the last undenied channel, their GitHub login or id); every change appends SAFE-5 rows admin-deny-add|remove / admin-github-add|remove (started before the write, then ok or error; refusals denied) and fails closed with no trail; the writer edits every list key the loader reads under the spelling the loader reads for aliases, keeps [corvidinho.plugins], [owner] and every other key (TOML guard unchanged; JSON guard compares every non-target key) and splices the live config in place; /admin config show lists the entries of each list with [github].users read-only; github watch re-reads the allowlist every poll cycle, skips the cycle when the file fails to load, polls nothing when the repo/org list is empty and forgets its denied ids when the GitHub lists change, while IDENTITY-12.a role resolution keeps working; no new env var, config key, schema or protocol change; tests/discord.admin-lists.test.ts and tests/watch.allowlist-reload.test.ts fail on the base sources and pass on the branch

## No-spec Rationale

Not applicable
