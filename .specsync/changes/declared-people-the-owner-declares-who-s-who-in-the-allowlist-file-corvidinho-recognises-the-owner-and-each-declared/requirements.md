---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: requirements
---

# Requirements

- Added **REQ-discord-036** (delta `deltas/discord.md`): declared people in
  the loaded allowlist file (`[people.<id>]` / JSON `people`), fail-closed
  parsing, the one resolver `resolvePerson` on stable ids only, the owner as
  a person, Discord recognition in the IDENTITY-4 block, and owner-only,
  SAFE-5-audited `/admin people list|add|link|unlink|remove` as the only
  writer (IDENTITY-13 / 14 / 6 / 7, ADMIN-3.a).
- Modified **REQ-discord-043**: `/admin` gains the `people` group; the
  users/channels-only write rule is scoped to those mutations; `config
  show` counts declared people and lists them among updatable knobs.
- Modified **REQ-discord-446**: the declared person's display wins over the
  owner map and the Discord names; unchanged with nobody declared.
- Added **REQ-watch-036** (delta `deltas/watch.md`): WATCH recognises the
  commenter by GitHub numeric id / login, with a leading
  `[Corvidinho acting GitHub user …]` paragraph; people re-read per event.
- HI: IDENTITY-13, IDENTITY-14, IDENTITY-6, IDENTITY-7, ADMIN-3.a (captured
  in this PR). IDENTITY-1..5, ADMIN-1..4, SAFE-5, ALLOW-4 unchanged. No
  acceptance criteria beyond the captured text; open design points are
  listed in `design.md` for Leif.
