---
change: forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments
artifact: docs
---

# Docs

- `docs/discord.md`: criteria line (MEMORY-1..9, MEMORY-ACL-1..6 and 6.a);
  slash table row for `/admin people forget`; Memory: the GitHub bullet
  (`memory-forget-me` points at the comment) and a new "Forget from GitHub or
  /admin (MEMORY-ACL-6.a)" bullet; source map (`src/watch/forget-me.ts`).
- `docs/WATCH.md`: "Forget me from GitHub" paragraph (phrase, numeric id,
  replies, outcome post, shared data dir); the `memory-forget-me` line;
  kept conversations also reached by numeric id.
- `docs/DISCORD-GO-LIVE.md`: forget requests also from GitHub and
  `/admin people forget`.
- Specs: `specs/discord/discord.spec.md` (prose, scenario, `files:` + the
  admin-forget test), `specs/watch/watch.spec.md` (purpose, API, invariants,
  examples, `files:` + `src/watch/forget-me.ts` and its test),
  `specs/plugins/plugins.spec.md` (memory-forget-me on GitHub),
  `specs/*/testing.md`.
- No new config key or env var; one new owner-only subcommand
  (`/admin people forget`); no schema change.
