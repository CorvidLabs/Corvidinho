---
id: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
state: approved
type: feature
base_commit: 72fec65395d657fef8c11ace63bd2205baa83f23
---

# Three roles: owner, team and community gate every tool. Each declared person has one role set only by the owner (role key or audited /admin people role); the tool layer re-resolves the actor's role from the people registry on every run and surface (runPlugin + catalog): owner keeps everything, team gets /work edits and PR, GitHub reviews and comments on allowlisted repos and only their own memory, community (and anyone undeclared, WATCH, schedules, workers) keeps today's read/chat tools; community site/roadmap sources are the public repo docs and the public issues and milestones of allowed public repos (IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a, #65)

## Intent

Three roles: owner, team and community gate every tool. Each declared person has one role set only by the owner (role key or audited /admin people role); the tool layer re-resolves the actor's role from the people registry on every run and surface (runPlugin + catalog): owner keeps everything, team gets /work edits and PR, GitHub reviews and comments on allowlisted repos and only their own memory, community (and anyone undeclared, WATCH, schedules, workers) keeps today's read/chat tools; community site/roadmap sources are the public repo docs and the public issues and milestones of allowed public repos (IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a, #65)

## Affected Canonical Specs

- `plugins`
- `agent`
- `discord`

## Acceptance Criteria

- Each declared person has exactly one role, read from role = "team" | "community" in the owner's people list (no role key = community; the owner is always owner; role = owner on anyone else grants nothing; a list or unknown value skips the entry), and only the owner sets it, by editing the file or with owner-only /admin people role (handler re-check, SAFE-5 admin-people-role rows before the write, fail closed) (IDENTITY-8, ADMIN-3.b); the tool layer resolves the acting role on every call and surface (resolveActingRole in runPlugin and the task-run catalog, re-reading the owner config and people list, the spawn's CORVIDINHO_ACTING_ROLE stamp only lowering it): the owner keeps every tool as ADMIN today (IDENTITY-9); team (Discord chat, button picks, /session start and /work of a declared team member) gets the read tools plus github-issue-comment / github-pr-review on GITHUB-6-allowlisted repos only, files-write / files-edit in its /work run, the /work draft PR, and only its own memory (IDENTITY-10); community (declared community, undeclared, WATCH, schedules, workers, muted or deny-listed) keeps today's read/chat catalog with no mutating tool (IDENTITY-11/12); community site/roadmap sources are the public repo docs (README, docs/, STATUS, CHANGELOG via github-docs-read) and the public issues and milestones of allowed public repos (github-issue-list, github-milestone-list), with no site URL (ROLES-CHAT-8.a); every existing ROLES-CHAT test stays green; tests/roles.team.test.ts, tests/github.public-docs.test.ts and tests/discord.admin-slash.test.ts cover each and fail on the base sources

## No-spec Rationale

Not applicable
