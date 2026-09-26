---
change: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
artifact: docs
---

# Docs

- `docs/discord.md`: nine-command table with `/admin` rows, a "Runtime
  admin" section (updatable vs read-only knobs, one store, atomic write, live
  without restart, env read-only, empty stays deny-all, first-user narrowing,
  SAFE-5 audit, mermaid flow), deny tip text, source map.
- `docs/BOX-UPDATE.md` is outside this change's approved path scope and is
  not edited here. Its step 3 count (eight → nine incl. `/admin`) is fixed
  by the companion docs change `box-update-md-slash-count-is-nine-guild-commands-incl-admin-43-companion-docs` on the same PR.
- `allowlist.example.toml`: `[discord]` note that `/admin` rewrites the
  `channels` / `users` lines in place.
- `ALLOWLIST_DENY_TIP` (DISCORD-DENY-2) points the owner at
  `/admin channels add` and fixes the env var name.
- CHANGELOG entry lands with the next 0.0.x release cut.
