---
id: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
state: approved
type: bug_fix
base_commit: 49273ff4a95fafcad87cde66492e3a8dd2c6c3f4
---

# File tools refuse the loaded allowlist file so people links never change through chat (IDENTITY-6)

## Intent

File tools refuse the loaded allowlist file so people links never change through chat (IDENTITY-6)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- IDENTITY-6 (captured on main, hi/identity.md: 'Only I add, change or remove a person's links, never through chat.'), backed by ALLOW-6 (hi/allow.md: 'Widening an allowlist is an explicit config change I make; the agent does not grow trust from chatting with someone new.'): files-write, files-edit and files-delete refuse with exit 2, before any write or existence check, with 'refused (IDENTITY-6): …' naming /admin people, when the target, judged where the write would land (relative or absolute, symlinks resolved, a hard link to the same file), is the allowlist file this process reads people from (resolveAllowlistPath: CORVIDINHO_ALLOWLIST_FILE, else ~/.config/corvidinho/allowlist.toml|json; both default paths are covered since creating either makes it the file read), for every caller including the owner's session and the local CLI; the file stays byte-for-byte unchanged. tests/files.allowlist-file.test.ts reproduces both cases (CORVIDINHO_ALLOWLIST_FILE inside a non-git project; the default path under a non-git HOME project, in a child process whose HOME is the project): an owner session (resolveActingIsAdmin true) files-edit adding a discord_ids link or changing a role is refused and the file is unchanged; it fails on the base sources and passes on the branch. /admin people add|link|unlink|remove keep working with their SAFE-5 audit rows (tests/discord.admin-people.test.ts unchanged and passing); writes to other project files are unchanged; the SAFE-2 and files suites pass unchanged. No new command, env var, config key or criterion.

## No-spec Rationale

Not applicable
