---
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-267` | `tests/search.secret-path.test.ts` | non-ADMIN: recursive search-grep (default, `.`, `--pattern`, `sub`) returns only `src/a.ts`, no line from `.env`, `.env.local`, `.ssh/*`, `certs/server.pem`, `wallet-keystore.json`, `credentials.json`, `sub/.ENV`; explicit `.env` (`./`, `..`, absolute, `--path`, `--path=`, `--pattern`), `.ssh`, pem, keystore and credentials paths exit 2 with ROLES-CHAT-8 like files-read; `--include=.env`, `env`, `env,local,json`, `=*.pem`, `pem`, `pem,ts`, `*` return no secret line; symlinks to `.env` / `.ssh` are refused for search-grep, files-read and files-list and not followed recursively; files-glob and files-list hide secret paths and `files-list .ssh` exits 2. 6 of 8 failed on main, 8 of 8 pass after. |
| `REQ-plugins-267` (ADMIN / CLI unchanged) | `tests/search.secret-path.test.ts` | ADMIN (owner) and no role session: files-read `.env` and search-grep explicit + recursive return the key; files-glob / files-list show `.env`, `.ssh/id_rsa`, `certs/server.pem`. Pass before and after. |
| `REQ-plugins-267` (review: git-diff, glob via symlink) | `tests/search.secret-path.test.ts` | non-ADMIN `git-diff`, `.` and `--staged` over 16 tracked secret paths (incl. `sub/.ENV`, `certs/b.PEM`, `KeyStore/x.txt`, `sub/Credentials.JSON`, `x/.env.d/z.txt`) list exactly the 5 look-alike plain files (`.envrc`, `a.pem.txt`, `y/credentials/ok.txt`, …) and print no secret line; explicit `.env` (`./`, `..`, absolute), `.ssh`, pem, `KeyStore`, and symlinks `notes` / `innocent.txt` exit 2; `*`, `:(glob)**`, `:(top).` stay literal; ADMIN / CLI still see every secret diff. `files-glob notes/*` (notes -> .ssh) returns nothing for non-ADMIN and `notes/id_rsa` for ADMIN / CLI. A recursive match in `src/odd:7:name.ts` keeps its file, line 2 and text. The non-ADMIN cases fail on 27fa424 and on main; the ADMIN / CLI cases pass on both. |
| `REQ-plugins-081` / `REQ-plugins-243` | `tests/search.plugins.test.ts`, `tests/files.plugins.test.ts`, `tests/plugins.argv-dashes.test.ts`, `tests/files.secret-path.test.ts`, `tests/roles.chat.gates.test.ts`, `tests/git.plugins.test.ts` | existing search/files/argv/role-gate cases unchanged and green. |
