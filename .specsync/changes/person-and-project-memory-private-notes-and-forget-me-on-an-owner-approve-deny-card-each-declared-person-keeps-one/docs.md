---
change: person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one
artifact: docs
---

# Docs

- `docs/discord.md`: criteria line names `hi/memory.md` (MEMORY-1..7,
  MEMORY-ACL-1..6); team bullet (profile, project memory); Memory section:
  profiles, privacy, project memory, forget me on the owner's card; source map
  (scope / profile / forget, approve-card / forget-card; which runs get which
  memory).
- `docs/DISCORD-GO-LIVE.md`: owner-only list gains reading someone's memory;
  forget requests reach the owner by DM (server privacy settings); team and
  community memory tools.
- `docs/BOX-UPDATE.md`: schema v12 (forward-only), forget on the owner's
  card.
- `docs/WATCH.md`: WATCH runs have no memory, profile, forget-me or project
  memory.
- `STATUS.md`: the #41 / #59 memory row mentions #101.
- Specs: `specs/discord/discord.spec.md` (invariants, inject, scenario,
  `files:` + scope / profile / forget / approve-card / forget-card and the
  card test), `specs/plugins/plugins.spec.md` (memory plugins prose,
  `files:` + the profiles test), `specs/agent/agent.spec.md` (prompt),
  `specs/*/testing.md`.
- No new user config key, env var or slash command. `memory-profile` and
  `memory-forget-me` are new tools; `GatewayHandlers.sendDm` is internal.
