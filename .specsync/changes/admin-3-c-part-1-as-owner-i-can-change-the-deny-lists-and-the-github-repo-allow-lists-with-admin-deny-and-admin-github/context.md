---
change: admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github
artifact: context
---

# Context

ADMIN-3.c is captured on main (`hi/admin.md`, Leif's 2026-09-28 interview,
round 10): "As owner I can change deny lists, mutes and the GitHub repo allow
lists with /admin; every change is audited." Until now `/admin` could only
change `[discord].users` and `[discord].channels` (ADMIN-1/2) and declared
people and roles (ADMIN-3.a/b); deny lists and `[github]` were edit-on-the-VM
only, and a running `github watch` read the allowlist once at start.

This change is part 1 (M3/M4 plan slice `admin-lists-a`): the deny lists and
the GitHub repo allow lists. Mutes are part 2 (next PR), so ADMIN-3.c stays
partial. No new hi capture: ADMIN-3.c is already on main.

Constraints carried in: #350 (plugin toggles, merged) reads
`[corvidinho.plugins]` from the same allowlist file, so the writer must keep
that table verbatim; #374 (merged) made WATCH resolve the triggering person's
role per event from the people list, which must keep working after a reload.
`[github].users` stays file / env (m34-defaults: the captured text says "repo
allow lists") and is shown read-only. An earlier aborted attempt left a stale
worktree on an old base; this change was built fresh from origin/main
54d6a6c.
