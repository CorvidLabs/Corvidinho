---
change: on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a
artifact: docs
---

# Docs

- `allowlist.example.toml`: `[owner] github_id` (how to find it; file only),
  matching by `discord_id` / `github_id` only; people: `github_logins` are
  labels, login-only entries load but are not recognised on GitHub until an
  id is linked (`/admin people link … github:` or `github_ids`; doctor warns).
- `docs/discord.md`: `/admin people link` row (looks the id up once);
  "Declared people" section: stable ids, new "On GitHub, the numeric user id
  only (IDENTITY-7.a)" bullet (WATCH paths, `[owner] github_id`, the lookup,
  labels, existing login-only entries, doctor); MEMORY-8 bullet; code map.
- `docs/WATCH.md`: declared commenters by numeric id only, owner by numeric
  id, SAFE-13 exemption by numeric id, memory by numeric id.
- `docs/DISCORD-GO-LIVE.md` E.1: `[owner] github_id` row and matching rule;
  declared people bullet.
- `.env.example`: `CORVIDINHO_OWNER_GITHUB_LOGIN` is for @mentions only.
- Specs: `specs/discord/discord.spec.md` (Public API prose, invariant
  paragraph, error rows, `files:` + `src/identity/github-user.ts`,
  `tests/identity.github-numeric-id.test.ts`), `specs/watch/watch.spec.md`
  (purpose, API, invariant, example, `files:` +
  `tests/watch.github-numeric-id.test.ts`), `specs/plugins/plugins.spec.md`,
  `specs/cli/cli.spec.md` (API row, error row); `testing.md` of discord,
  watch, plugins, cli, agent.
- No new env var, CLI flag, slash command, table or column; one new config
  key (`[owner] github_id`).
