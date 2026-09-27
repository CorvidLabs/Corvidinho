---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: docs
---

# Docs

Canonical spec delta adds REQ-plugins-267. `specs/plugins/plugins.spec.md`
invariant for ROLES-CHAT-8 now names `search-grep`, `git-diff`, `files-glob`
and `files-list`, adds behavioral scenarios, and lists
`tests/search.secret-path.test.ts`. No README / docs change: docs already say
non-ADMIN sessions are refused secret paths; the tools now match.
