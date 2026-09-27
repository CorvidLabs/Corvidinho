---
module: plugins
change: search-grep-files-glob-and-files-list-refuse-and-hide-secret-paths-for-non-admin-role-sessions-like-files-read-roles
---

# Delta — plugins (search-grep, files-glob and files-list refuse and hide secret paths)

## Added

### REQUIREMENT REQ-plugins-267

In a non-ADMIN role session (`CORVIDINHO_ACTING_IS_ADMIN` set and the acting
user is not ADMIN), the read-ish file tools SHALL apply the ROLES-CHAT-8
secret-path gate `files-read` applies (`isSecretPath`: `.env*`, `.ssh`,
key files, keystores, credentials). `search-grep` and `files-list` SHALL
refuse an explicit secret path, given positionally, with `--path`, as
`./`, `..` or absolute spellings, or through a symlink that resolves to
one, with exit 2 and the ROLES-CHAT-8 refusal message, before reading
anything. A recursive `search-grep` SHALL NOT return a line from a secret
file whatever `--include` is passed, and `files-glob` and `files-list`
SHALL leave secret paths out of their results. ADMIN sessions and the local
CLI (no role session) SHALL keep the access `files-read` gives them. The
gate SHALL be re-checked on each call (ROLES-CHAT-6). No new plugin, flag,
env var or config key.

Acceptance Criteria
- Non-ADMIN `search-grep` over the project returns no line from `.env`, `.env.local`, `.ssh/*`, `*.pem`, `*keystore*`, `credentials.json` or a case variant such as `sub/.ENV`, and still returns lines from ordinary files.
- Non-ADMIN `search-grep <pattern> .env` (also `./.env`, `src/../.env`, the absolute path, `--path .env`, `--path=.env`, `--pattern X .env`) and `search-grep` of `.ssh`, a `.pem`, a keystore or a credentials file is refused with exit 2 and a ROLES-CHAT-8 error, like `files-read .env`.
- Non-ADMIN `search-grep` with `--include=.env`, `--include env`, `--include=*.pem`, `--include pem,ts` or `--include *` returns no secret line.
- Non-ADMIN `search-grep` or `files-list` of a symlink to `.env` or `.ssh` is refused with exit 2; a recursive search does not follow such a symlink.
- Non-ADMIN `files-glob` (`**/*`, `.env*`, `**/*.pem`, `.ssh/*`) and `files-list --show-hidden` return no secret path; `files-list .ssh` is refused with exit 2.
- ADMIN and the local CLI still read `.env` with `files-read`, grep it explicitly and recursively, and see secret paths in `files-glob` / `files-list`.
