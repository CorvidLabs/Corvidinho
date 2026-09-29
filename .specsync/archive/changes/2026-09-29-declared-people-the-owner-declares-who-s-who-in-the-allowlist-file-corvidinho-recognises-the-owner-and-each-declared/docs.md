---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: docs
---

# Docs

- `docs/discord.md`: criteria line (ADMIN-3.a, IDENTITY-1..7, 13/14);
  slash table rows for `/admin people list|add|link|unlink|remove`; the
  runtime-admin knob table gains declared people; new "Declared people"
  section (file format, recognition on Discord and GitHub, stable ids only,
  owner-only / never through chat, live, fail closed); Code map line.
- `docs/WATCH.md`: declared commenters and the identity paragraph.
- `docs/DISCORD-GO-LIVE.md` E.1: declared people bullet.
- `allowlist.example.toml`: commented `[people.<id>]` template.
- `STATUS.md`: #36 no longer "awaits HI".
- Specs: `specs/discord/discord.spec.md` (Public API prose, identity-inject
  prose, `files:` + new sources and tests), `specs/watch/watch.spec.md`
  (Public API prose), `specs/discord/testing.md`, `specs/watch/testing.md`.
- No new env var, config key, CLI flag or top-level slash command; `/admin`
  gains the `people` subcommand group.
