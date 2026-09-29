---
change: docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in
artifact: requirements
---

# Requirements

No new hi/ criteria (none captured, none invented). The change makes the
operator text match what already-confirmed criteria and canonical
requirements say:

- **ALLOW-3 / DISCORD-5** with **REQ-discord-043** ("When the first user is
  added while users and roles were both empty, the reply SHALL warn that
  unlisted callers now resolve to BLOCKED") → `--help` and the go-live
  checklist say both empty = anyone in an allowlisted channel, once either
  is set only those users, role holders and the owner.
- **CLI-8** with **REQ-cli-108** / the daemon's `spend.warning` requirement →
  `docs/DAEMON.md` lists every event the daemon logs.

Canonical requirements (see deltas, all Modified, new acceptance bullets
only): **REQ-cli-005**, **REQ-cli-108**, **REQ-discord-005**.
