---
change: security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win
artifact: docs
---

# Docs

- `specs/plugins/testing.md`: SAFE-2 `specs/` coverage (REQ-plugins-083 /
  182), `deny_orgs` on git-push (REQ-plugins-004), ROLES-CHAT-8 real-lookup
  tests (REQ-plugins-493).
- `specs/watch/testing.md`: router `deny_users` / `deny_orgs` (REQ-watch-003).
- `specs/discord/testing.md`: live DISCORD-8 check (REQ-discord-012 /
  REQ-discord-476).
- Canonical requirements through the delta (materialized by
  `specsync change check`).
- No operator docs change: behaviour is unchanged, so nothing in `docs/`,
  README or DISCORD-GO-LIVE.md becomes false. No CHANGELOG / version edits.
