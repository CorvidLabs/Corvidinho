---
module: plugins
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
---

# Delta: plugins (the file tools never change the allowlist file people are read from — IDENTITY-6)

## Added

### REQUIREMENT REQ-plugins-1204

The file tools never change the allowlist file this process reads people
from (IDENTITY-6, captured on main, `hi/identity.md`: "Only I add, change or
remove a person's links, never through chat."; ALLOW-6, `hi/allow.md`:
"Widening an allowlist is an explicit config change I make; the agent does
not grow trust from chatting with someone new."). In a project folder that
isn't a git repo the owner's talk runs in the folder itself (AGENT-1.a), so
that file can sit inside the project: `CORVIDINHO_ALLOWLIST_FILE` pointing
into it, or a bridge whose `$HOME` is a non-git project (the default
`~/.config/corvidinho/allowlist.toml`). A file tool that could change it
would add, change or remove a person's links and roles from chat, past
`/admin people` and its SAFE-5 audit rows.

- `files-write`, `files-edit` and `files-delete` SHALL refuse (ok=false,
  exit 2, nothing written, before any existence or size check) a target
  that, where the write would land (`resolveProjectPath`: relative or
  absolute, symlinks resolved), is one of `allowlistFilePaths(env, home)`
  or a regular file sharing the inode of one (a hard link):
  `resolveAllowlistPath(env, home)` (`CORVIDINHO_ALLOWLIST_FILE`, else the
  first of `~/.config/corvidinho/allowlist.toml|json` that exists) and both
  default paths (creating either makes it the file read, `.toml` first),
  each as written and where it lands (symlinks resolved, a dangling link
  followed). `home` SHALL be `homedir()` and, when it differs, `env.HOME`;
  a relative `CORVIDINHO_ALLOWLIST_FILE` SHALL be taken from this process's
  cwd (where its loader reads it) and from home (as the shell's SAFE-21
  guard does). `isAllowlistFilePath` in `plugins/files/protectedPaths.ts`,
  checked in `refuseProtected` after the SAFE-2, SpecSync-record, AGENT-1.b
  and persona rules.
- The refusal SHALL read `refused (IDENTITY-6): '<path>' is Corvidinho's
  allowlist file, …` (`allowlistFileRefuseMessage`), naming ALLOW-6 and
  `/admin people add|link|unlink|remove|role` (audited) or the file on the
  VM as the way links change.
- It SHALL apply to every caller (the owner's session, other role sessions,
  the local CLI, `plugins run`), with no override.
- `/admin people` (ADMIN-3.a / ADMIN-3.b) SHALL be unchanged;
  writes to other project files, reads, and the shell's SAFE-21 refusal of
  the file SHALL be unchanged. No new command, env var or config key.

Acceptance Criteria
- `tests/files.allowlist-file.test.ts`, `CORVIDINHO_ALLOWLIST_FILE` inside a non-git project: in the owner's session (`resolveActingIsAdmin()` true, the owner read from that file) `files-edit` adding a `discord_ids` link or changing `role = "community"` to `"team"`, by relative, `./` and absolute path, is refused with exit 2, `refused (IDENTITY-6)` and `/admin people`; `files-write` and `files-delete` are refused for the owner and the local CLI; a symlink to it and a hard link to it are refused, and with the env naming the link the file it leads to is refused; the file stays byte-for-byte unchanged.
- Same file, the default path under a non-git `$HOME` project: a child process whose `HOME` is the project and with no `CORVIDINHO_ALLOWLIST_FILE` (the owner read from `~/.config/corvidinho/allowlist.toml`, `resolveActingIsAdmin()` true) refuses the same `files-edit` link and role changes, `files-write` and `files-delete`, and still writes `notes.txt`; with only `allowlist.json` present, creating `allowlist.toml` and overwriting `allowlist.json` are refused.
- Same file: `notes.txt`, `src/app.ts`, `allowlist.example.toml` and `sub/allowlist.toml` are written, `notes.txt` is edited and `src/app.ts` deleted as before; `isAllowlistFilePath` covers both default paths and a dangling default link's target, and not `other.toml` or `~/allowlist.toml`.
- With the base sources the refusal cases fail; the other-files case passes on both. `tests/discord.admin-people.test.ts` (add, link, unlink, remove with their audit rows), `tests/files.*.test.ts` and `tests/plugins.nongit-project-dir.test.ts` pass unchanged.
