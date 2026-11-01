---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: research
---

# Research

- Reproduced on main (49273ff4) with `tests/files.allowlist-file.test.ts`:
  in the owner's session (`resolveActingIsAdmin()` true) `files-edit`
  added a `discord_ids` link and changed `role = "community"` to
  `"team"` in `allowlist.toml` inside a non-git project named by
  `CORVIDINHO_ALLOWLIST_FILE` (ok, file changed); `files-write` and
  `files-delete` did the same, through a symlink and a hard link too. In a
  child process whose `HOME` is a non-git project (no env file) the same
  edits of `~/.config/corvidinho/allowlist.toml` went through.
- Who reads the file: `loadAllowlistFile`, `loadOwnerConfig`,
  `loadDeclaredPeople` (via the loaded `sourcePath`), `/admin`'s writer
  (`resolveAdminAllowlistPath`) and doctor all resolve it with
  `resolveAllowlistPath(env, home)` (`src/allowlist/load.ts`):
  `CORVIDINHO_ALLOWLIST_FILE` (leading `~` read as home, else as written,
  so a relative value is read from the process cwd), else the first of
  `allowlist.toml` / `allowlist.json` under `~/.config/corvidinho` that
  exists. So creating `allowlist.toml` next to a live `allowlist.json`
  changes which file is read.
- A bridge-spawned run inherits the bridge env (`CORVIDINHO_ALLOWLIST_FILE`,
  `HOME`) and runs with the talk's cwd (`src/discord/agent-client.ts`);
  Bun's `os.homedir()` reads `HOME` at process start only, so the test of
  the default path runs a child `bun` process with `HOME` the project.
- `resolveProjectPath` returns where a write lands (existing paths
  realpath'd, a missing leaf under its parent's real path, a dangling link
  followed). `isNonGitRootInstructionPath` (AGENT-1.b) already compares
  that landing path and a shared inode; the new check follows the same
  pattern for the allowlist file, which may itself be a symlink.
- The shell's SAFE-21 guard resolves a relative allowlist value from home
  (`secretPlaces`); the new check takes both the process cwd and home.
