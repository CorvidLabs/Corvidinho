---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: research
---

# Research

- `plugins/files/commands.ts` `files-read` gate: `roleSessionActive() &&
  !(await resolveActingIsAdmin()) && (isSecretPath(pathArg) ||
  isSecretPath(abs))` ⇒ exit 2, `secretRefuseMessage`. ADMIN and no role
  session read secrets.
- `plugins/search/commands.ts` spawns `grep -rn -I` over the resolved path
  with no secret check; `--include ext` becomes `--include=*.ext`, and
  `*.env` matches `.env` (grep's globs do not special-case a leading dot).
- GNU grep 3.11: when `--include` and `--exclude` both match, the last one
  given wins; `--exclude` globs are case-sensitive; `-r` follows symlinks
  only on the command line; with a single file operand no name is printed.
- `files-glob` (Bun `Glob.scan`, `dot: true`) and `files-list`
  (`readdirSync`, `--show-hidden`) had no secret filter.
- Other read plugins: git-diff shows tracked files only (`.env*`, `*.pem`
  are gitignored here), specsync-read reads specs; shell-exec, web-fetch are
  dangerous (non-ADMIN refused). Out of scope for this fix.
- Repro before the fix (non-ADMIN): `search-grep FAKEFAKE` ⇒ 3 matches incl.
  `.env:1:OPENAI_API_KEY=sk-proj-...` and `sub/server.pem`, exit 0;
  `search-grep OPENAI_API_KEY .env` ⇒ the key line, exit 0;
  `files-glob '**/.env*'` ⇒ `.env`; `files-list . --show-hidden` ⇒ `f .env`.
