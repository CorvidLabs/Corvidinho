# Lesson bundle — search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Search-grep, files-glob and files-list refuse and hide secret paths for non-ADMIN role sessions like files-read (ROLES-CHAT-8)
- **Kind**: BugFix
- **Specs**: plugins
- **Paths**: plugins/search/commands.ts, plugins/files/commands.ts, plugins/files/protectedPaths.ts, plugins/files/resolvePath.ts, tests/search.secret-path.test.ts, specs/plugins, plugins/git/commands.ts
- **Acceptance**: In a non-ADMIN role session (CORVIDINHO_ACTING_IS_ADMIN set, not admin), search-grep and git-diff refuse an explicit secret path (.env*, .ssh, keys, keystores; also via ./, .., absolute path, --path, or a symlink) with exit 2 and the ROLES-CHAT-8 message like files-read, a recursive search never returns lines from secret files, whatever --include is passed, and git-diff (worktree or --staged) never lists or prints a tracked secret file; files-glob and files-list leave secret paths out (also through a symlinked directory) and files-list refuses a secret directory; ADMIN and the local CLI keep the same access as files-read

## Evidence

- Verification commit: `ee260c2765cf7187bd361033a46823a863898a73`
- Base commit: `6e5370dd5174f006ec16ffc609116c016055a7b8`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

# Context

End-to-end check of origin/main (6e5370d): with a fake key in `.env` and
`CORVIDINHO_ACTING_IS_ADMIN=0 CORVIDINHO_ACTING_DISCORD_USER_ID=5`,
`plugins run files-read .env` is refused (exit 2, ROLES-CHAT-8) but
`plugins run search-grep FAKEFAKE` returned
`.env:1:OPENAI_API_KEY=sk-proj-...` and `search-grep OPENAI_API_KEY .env`
returned the key line too. `plugins/search/commands.ts` never called
`isSecretPath`, and `search-grep` is in the non-ADMIN read catalog
(ROLES-CHAT-2), so any community chatter could have the agent print secrets
that `files-read` refuses. `files-glob` and `files-list` also listed
`.env`, `.ssh/id_rsa` and keystores, and `files-list .ssh` listed a key
directory.

HI: ROLES-CHAT-8 (hi/roles.md — non-ADMIN community sessions refuse secret
paths), SAFE-2 and SAFE-6 (hi/safe.md — protected env files / keystores;
secrets kept out of saved sessions). No new acceptance criteria: the fix
applies the existing `files-read` gate to the other read tools.

## From the change's design.md

# Design

- `plugins/files/protectedPaths.ts`: `secretPathsRefused()` is the one
  ROLES-CHAT-8 gate (`roleSessionActive() && !(await resolveActingIsAdmin())`,
  re-checked per call) used by `files-read`, `files-list`, `files-glob` and
  `search-grep`. `SECRET_GREP_EXCLUDES` mirrors `isSecretPath` as grep
  `--exclude` / `--exclude-dir` globs, kept next to it.
- `search-grep`, non-ADMIN only: refuse when `isSecretPath(pathArg)` or
  `isSecretPath` of the resolved (realpath) target relative to the project
  root matches — catches `./`, `..`, absolute and symlink spellings. The
  secret excludes are appended after the `--include` globs (grep lets the last
  matching include/exclude win), so `--include env` / `pem` / `*` cannot pull
  a secret back in. Output uses `grep -Z`, so each record's file name is
  NUL-terminated; lines whose file `isSecretPath` matches (e.g. `.ENV`, which
  the case-sensitive globs miss) are dropped. `grep -r` does not follow
  symlinks found while recursing. A single-file operand prints no name; that
  file was already checked, and its output is unchanged.
- `files-list`: same explicit-path refusal; entries whose name
  `isSecretPath` matches are hidden. `files-glob`: a match is skipped when
  `isSecretPath` matches its path or its resolved path relative to the root
  (a pattern such as `notes/*` walks a symlink into `.ssh`).
- `git-diff`, non-ADMIN only: an explicit path is refused when
  `isSecretPath` matches it, its repo-relative form or its resolved target.
  `SECRET_GIT_EXCLUDE_PATHSPECS` (next to `isSecretPath`) mirrors it as
  `:(exclude,glob,icase)` pathspecs appended to both `git diff` calls; those
  need pathspec magic, so the run drops `GIT_LITERAL_PATHSPECS` and keeps user
  paths literal per element with `:(literal)`. If `--name-status` still lists
  a secret path, the call fails closed (exit 2) before the diff runs. ADMIN /
  CLI runs are unchanged.
- Recursive `search-grep` match records take `file` from the NUL-terminated
  name and `line` / `text` from the rest, so a file name holding `:N:` is not
  misparsed.
- `files-read` keeps its check (`pathArg` or absolute target) and now calls
  the shared gate. The new checks test the target relative to the project
  root, so a project directory whose ancestor looks secret does not refuse
  every search.
- ADMIN and the local CLI (no role session) keep `files-read`'s access,
  including grepping secrets, for consistency. `resolvePath.ts` exports
  `realRoot` for the relative check. No new plugin, flag, env var or config.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-267` | `tests/search.secret-path.test.ts` | non-ADMIN: recursive search-grep (default, `.`, `--pattern`, `sub`) returns only `src/a.ts`, no line from `.env`, `.env.local`, `.ssh/*`, `certs/server.pem`, `wallet-keystore.json`, `credentials.json`, `sub/.ENV`; explicit `.env` (`./`, `..`, absolute, `--path`, `--path=`, `--pattern`), `.ssh`, pem, keystore and credentials paths exit 2 with ROLES-CHAT-8 like files-read; `--include=.env`, `env`, `env,local,json`, `=*.pem`, `pem`, `pem,ts`, `*` return no secret line; symlinks to `.env` / `.ssh` are refused for search-grep, files-read and files-list and not followed recursively; files-glob and files-list hide secret paths and `files-list .ssh` exits 2. 6 of 8 failed on main, 8 of 8 pass after. |
| `REQ-plugins-267` (ADMIN / CLI unchanged) | `tests/search.secret-path.test.ts` | ADMIN (owner) and no role session: files-read `.env` and search-grep explicit + recursive return the key; files-glob / files-list show `.env`, `.ssh/id_rsa`, `certs/server.pem`. Pass before and after. |
| `REQ-plugins-267` (review: git-diff, glob via symlink) | `tests/search.secret-path.test.ts` | non-ADMIN `git-diff`, `.` and `--staged` over 16 tracked secret paths (incl. `sub/.ENV`, `certs/b.PEM`, `KeyStore/x.txt`, `sub/Credentials.JSON`, `x/.env.d/z.txt`) list exactly the 5 look-alike plain files (`.envrc`, `a.pem.txt`, `y/credentials/ok.txt`, …) and print no secret line; explicit `.env` (`./`, `..`, absolute), `.ssh`, pem, `KeyStore`, and symlinks `notes` / `innocent.txt` exit 2; `*`, `:(glob)**`, `:(top).` stay literal; ADMIN / CLI still see every secret diff. `files-glob notes/*` (notes -> .ssh) returns nothing for non-ADMIN and `notes/id_rsa` for ADMIN / CLI. A recursive match in `src/odd:7:name.ts` keeps its file, line 2 and text. The non-ADMIN cases fail on 27fa424 and on main; the ADMIN / CLI cases pass on both. |
| `REQ-plugins-081` / `REQ-plugins-243` | `tests/search.plugins.test.ts`, `tests/files.plugins.test.ts`, `tests/plugins.argv-dashes.test.ts`, `tests/files.secret-path.test.ts`, `tests/roles.chat.gates.test.ts`, `tests/git.plugins.test.ts` | existing search/files/argv/role-gate cases unchanged and green. |

## Where these lessons go

- `specs/plugins/context.md`
