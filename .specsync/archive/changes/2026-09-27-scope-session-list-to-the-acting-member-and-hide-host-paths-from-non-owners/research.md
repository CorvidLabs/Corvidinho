---
change: scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners
artifact: research
---

# Research

`SessionStore.list()` returns every non-expired session; `create` resolves
`project` to an absolute directory (`resolveProjectDir`), so the old list
line printed host paths. `slash-dispatch` gives `/session` no
`minPermission`, so any allowlisted member reached the list. `/status`
formats counts only; `/agents` is static; `/work` has no list; `/schedule
list` printed the stored `project` verbatim.
