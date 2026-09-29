---
id: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
state: implementing
type: feature
base_commit: e54ec96dbd98ee6f6f85b80d81f9780cbf5fd889
---

# Declared people: the owner declares who's who in the allowlist file, Corvidinho recognises the owner and each declared person on Discord and GitHub by stable ids only, and only the owner changes people and links with audited /admin people (IDENTITY-13/14/6/7, ADMIN-3.a, #36)

## Intent

Declared people: the owner declares who's who in the allowlist file, Corvidinho recognises the owner and each declared person on Discord and GitHub by stable ids only, and only the owner changes people and links with audited /admin people (IDENTITY-13/14/6/7, ADMIN-3.a, #36)

## Affected Canonical Specs

- `discord`
- `watch`

## Acceptance Criteria

- The owner declares people as [people.<id>] entries (display, nicknames, discord_ids, github_logins, github_ids) in the allowlist file the process loaded and that list is who's who (IDENTITY-13); a declared person and the owner are recognised on Discord (chat, button picks, /session start, /work identity block) and on GitHub (WATCH prompt block) by Discord user id, GitHub numeric id or GitHub login only, never by a display name or nickname, and an id linked to two people matches nobody (IDENTITY-14, IDENTITY-7); only the owner adds, changes or removes people and links, by editing the file or with owner-only /admin people add|link|unlink|remove that re-checks ADMIN at handler time and appends SAFE-5 audit rows before writing (fail closed without a trail), and no chat or plugin path writes people (IDENTITY-6, ADMIN-3.a); changes apply on the next message or WATCH event without a restart; tests/identity.people.test.ts, tests/discord.admin-people.test.ts and tests/identity.recognise.test.ts cover each and fail on the base sources

## No-spec Rationale

Not applicable
