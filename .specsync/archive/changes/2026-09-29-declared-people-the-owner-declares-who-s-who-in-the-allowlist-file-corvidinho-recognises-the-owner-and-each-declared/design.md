---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: design
---

# Design

- **Store (IDENTITY-13).** `[people.<id>]` sections in the allowlist file
  the process loaded (`AllowlistConfig.sourcePath`, the file `[owner]` is
  read from); a `people` object in a JSON file. Keys `display`,
  `nicknames`, `discord_ids`, `github_logins`, `github_ids` (singular
  spellings read). No new env var, config key, table, column or schema bump.
- **Reader + resolver** (`src/identity/people.ts`): quote-aware one-line
  TOML reader (like `parseOwnerToml`, since the shared list reader splits on
  commas) and a JSON reader; fail closed per entry. `buildPeopleDirectory`
  adds the owner (declared holder of the owner's Discord id, else built-in
  `owner`) and indexes Discord ids / GitHub logins / GitHub ids, dropping any
  id held by two people. `resolvePerson(dir, { discordId, githubLogin,
  githubId })` → `{ personId, displayName?, role?, person }` | null is the
  one resolver for #65 / #101 / #67; `role` is only `owner` today.
  `loadDeclaredPeople({ allowlist, owner })` re-reads the file on each call
  and never throws.
- **Discord (IDENTITY-14).** `IdentityInjectInput.people`; the bridge (chat
  + button-pick resume), `/session start` and `/work` pass
  `loadDeclaredPeople`. `resolveActingPerson` matches the acting Discord id
  only; the built-in owner entry is left to the existing owner lines.
- **GitHub (IDENTITY-14).** Search items / comments carry `user.id` →
  `DetectedEvent.senderId`; `startWatchPoller` loads the owner and passes
  `people` per event to `routeEvent`; `formatWatchIdentityBlock` builds a
  leading `[Corvidinho acting GitHub user …]` paragraph (Planning skips it).
- **Writer (ADMIN-3.a / IDENTITY-6)** (`src/discord/admin-people.ts`):
  `planPeopleChange` → SAFE-5 `started` → `commitPeopleChange`
  (`writeFileAtomic`) → `ok`, synchronous like `/admin users|channels`,
  reusing `resolveAdminAllowlistPath`, `danglingSymlinkError`,
  `parseJsonObject`, `scanSimpleToml`. A re-read safety net refuses any
  rewrite that would change lists, `[owner]`, another person or another
  section. After a write the live `allowlist.sourcePath` is set when it was
  null, so a bridge that started without a file reads the new one.
  `/admin people` routes live in `command-handlers/admin.ts`; the slash body
  adds a `people` group after `config`.

## Design choices pending Leif

Each is the most conservative reading of the captured text; none adds a
criterion.

1. People live in the allowlist file (`[people.<id>]`), not a separate
   people file; `owner` is a reserved person id.
2. `/admin people add` also changes the display name (the "change" of
   ADMIN-3.a); `link` / `unlink` take `discord` / `github` / `github_id`
   / `nickname`; no autocomplete for person ids.
3. Recognition covers the speaker (Discord acting user) and the commenter
   (WATCH) only; people merely mentioned, GitHub tool results and
   `discord-user-lookup` results are not annotated yet.
4. Once anyone is declared, an undeclared speaker is marked
   `declared_person: none`; with nobody declared prompts are byte-identical.
5. The declared display name wins over `[owner]` display and Discord names.
6. Nicknames are shown to the model but never matched (not stable ids).
7. GitHub logins count as stable ids, but a known numeric id that differs from
   the declared ones overrides the login.
8. An id linked to two people matches nobody; `/admin people link` refuses
   it, including the owner's `[owner]` GitHub login on someone else.
9. The owner's `[owner]` / env links are not editable through `/admin
   people` (edit on the VM); linking the owner's Discord id to a person makes
   it the owner's person.
10. A WATCH process that started without an allowlist file needs a restart
    to see a file created later (the bridge picks it up via `/admin people`).
11. No-change requests are not audited (as `/admin users|channels`).
