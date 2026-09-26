---
change: strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner
artifact: docs
---

# Docs

- docs/discord.md admin-detection paragraph: owner-only, lists ignored.
- docs/DISCORD-GO-LIVE.md, .env.example, allowlist.example.toml: owner is the
  only ADMIN; admin lists ignored.
- `goLiveChecklist()` item 5 (src/discord/config.ts) says the same.
- CHANGELOG entry lands with the next 0.0.x release cut.
