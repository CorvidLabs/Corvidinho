---
change: declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared
artifact: research
---

# Research

- Owner record: `src/identity/owner.ts` reads `[owner]` from the file the
  process loaded (`loadOwnerConfig({ filePath: allowlist.sourcePath })`), env
  wins per field, matching by Discord snowflake / lowercased login only.
- The allowlist loader (`scanSimpleToml`) reads `[people.<id>]` as a lenient
  non-list section (one-line values, a `deny…` key anywhere but
  [github]/[discord] throws), so people sections never change what it loads;
  it splits quoted values on commas, so people (like `[owner]`) need their
  own quote-aware reader (display names hold commas and `#`).
- `/admin` (`admin-allowlist.ts`): plan → SAFE-5 `started` → atomic
  `writeFileAtomic` → `ok`, all synchronous; `rewriteProblem` re-reads the
  new text before writing; `resolveAdminAllowlistPath` = loaded file, else
  configured / default path.
- Identity inject call sites: bridge chat, bridge button-pick resume,
  `/session start`, `/work` (REQ-discord-446). The model's file tools are
  confined to the run's project folder (`plugins/files/resolvePath.ts`).
- WATCH: `DetectedEvent.sender` is the login only; Octokit search items and
  issue comments carry `user.id` (numeric, stable across renames).
  Planning drops paragraphs that open with `[Corvidinho ` from spec selection
  (`planningSelectionText`), so an identity paragraph must lead with it.
- Tests: a bridge started with `CORVIDINHO_ALLOWLIST_FILE` + dry-run +
  null gateway; the poller with `fetchEvents` injection and `filePath`.
