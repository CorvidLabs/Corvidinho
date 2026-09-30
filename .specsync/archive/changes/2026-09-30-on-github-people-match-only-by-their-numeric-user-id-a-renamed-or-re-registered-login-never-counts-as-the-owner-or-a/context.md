---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: context
---

# Context

Issue #36 (CONTACTS, milestone M1 "Knows everyone"). The declared-people
slice (#271) left design choice 7 pending Leif: GitHub logins counted as
stable ids unless a known numeric id differed. Leif decided it in the
2026-09-28 interview record, round 12 (2026-09-29): **numeric id only on
GitHub** — a GitHub person matches only by numeric user id; a login alone never
matches (a renamed or re-registered login can't impersonate); `[owner]` gets a
`github_id` key; `/admin people link github` stores the id once. Captured with
`hi` in this PR's first commit (`61fbe16`, on main `20a0f58`):

- **IDENTITY-7.a** "On GitHub it matches people only by their numeric user id,
  so a renamed or re-registered login never counts as them." (parent
  **IDENTITY-7** "It matches people on stable ids, never on display names."
  was already captured.)

Gap on main: `resolvePerson` (src/identity/people.ts ~681) accepted a login
unless the person declared `github_ids` and the event's id differed; a person
or owner with only a login — the built-in owner always, since `[owner]` had no
id key — matched any account holding that login. That reached every GitHub
recognition path: the WATCH identity block and `role: owner` line, the WATCH
memory inject and memory plugins (MEMORY-8, #292), and the SAFE-13 owner
exemption in `watchInjectionVerdict` (#295). `isOwnerGithub` compared logins.
Roles (`resolveActingRole`, src/plugins/roles.ts) match the Discord id only
and WATCH runs are community, so roles needed no change.

Constraints (settled): reuse the owner / allowlist file and the one resolver;
owner admins; v1 off-chain; no schema bump; no package version bump; #232 /
#233 are landed separately and untouched.
