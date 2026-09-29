---
change: three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key
artifact: docs
---

# Docs

- `docs/discord.md`: criteria line (ADMIN-3.b, IDENTITY-1..14, ROLES-CHAT);
  slash table row for `/admin people role`; runtime-admin knob row for roles;
  new "Roles" section (the `role` key, what owner / team / community get,
  checked in the tool layer on every call and surface, only the owner sets
  it); Code map line.
- `docs/DISCORD-GO-LIVE.md`: roles bullet in the owner section; the dangerous
  tools table and the mutating note name what team gets; E.6 becomes "Roles:
  owner, team, community" (team tools, community site / roadmap sources, the
  internal spawn stamps).
- `docs/WATCH.md`: team reads, WATCH runs are community.
- `allowlist.example.toml`: `role` in the `[people.<id>]` template.
- `STATUS.md`: the ROLES-CHAT note, the `/work` → PR row, the write-plugins
  note and the #42 row mention the #65 roles.
- Specs: `specs/plugins/plugins.spec.md` (role gate prose, ROLES-CHAT-8.a
  readers, error cases, `files:` + `plugins/github/public-docs.ts` and the two
  tests), `specs/agent/agent.spec.md` (catalog by role, prompt),
  `specs/discord/discord.spec.md` (people/role exports, roles on Discord
  surfaces), `specs/*/testing.md`.
- No new user config key or CLI flag and no new top-level slash command;
  `/admin people` gains `role`. `CORVIDINHO_ACTING_ROLE` and
  `CORVIDINHO_ACTING_WORK_TASK` are internal spawn stamps (like
  `CORVIDINHO_ACTING_IS_ADMIN`), always overwritten by the bridge.
