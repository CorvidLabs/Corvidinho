---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: testing
---

# Testing

`tests/files.allowlist-file.test.ts` (7 tests): temp folders only, never
this checkout or the operator's config; the allowlist file holds `[owner]`,
`[people.tofu]` (team) and `[people.pat]` (community). The env-file cases
run in-process through `runPlugin` with the owner's session stamped as the
bridge does; the default-path cases run a child `bun` process with `HOME`
and cwd the project and no `CORVIDINHO_ALLOWLIST_FILE` (Bun's
`os.homedir()` reads `HOME` only at start). Each case reads the file back
byte for byte. The module under change is imported dynamically only in its
unit case, so the file loads on the base sources.

Fail-on-base proof: with 49273ff4's `plugins/files/commands.ts` and
`plugins/files/protectedPaths.ts` swapped in, `bun test
tests/files.allowlist-file.test.ts` gave 1 pass, 6 fail: every refusal case
failed on `expect(r.ok).toBe(false)` (the edit, write or delete returned ok
and changed the file) and the unit case found no `isAllowlistFilePath`.
The other-files case passes on both. Restored: 7 of 7 pass.

`tests/discord.admin-people.test.ts` (`/admin people add|link|unlink|remove`
with their `admin-people-*` audit rows), `tests/files.*.test.ts`,
`tests/plugins.nongit-project-dir.test.ts`, `tests/agent.nongit-project-dir.test.ts`,
`tests/discord.nongit-project-dir.test.ts`, `tests/identity.people.test.ts`
and the persona suites pass unchanged (222 tests across 18 files).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-1204` | "IDENTITY-6: CORVIDINHO_ALLOWLIST_FILE inside a non-git project" > "the owner's session can't link an account or change a role through files-edit; the file stays byte-for-byte" | owner session (`resolveActingIsAdmin()` true): `files-edit` adding a `discord_ids` link and changing `role = "community"` to `"team"` by relative, `./` and absolute path: exit 2, `refused (IDENTITY-6)`, `/admin people`; file unchanged. Fails on base. |
| `REQ-plugins-1204` | same describe > "files-write and files-delete are refused too, for the owner and the local CLI alike" | `allowlist.toml`, `./sub/../allowlist.toml`, absolute; local CLI and owner; file unchanged. Fails on base. |
| `REQ-plugins-1204` | same describe > "a symlink to it and a hard link to it are judged where the write lands" | `people.toml -> allowlist.toml` (edit, write, delete) and a hard link (edit, write) refused; with the env naming the link, writing `allowlist.toml` refused; file unchanged. Fails on base. |
| `REQ-plugins-1204` | same describe > "other project files are written, edited and deleted as before" | `notes.txt`, `src/app.ts`, `allowlist.example.toml`, `sub/allowlist.toml` written; `notes.txt` edited; `src/app.ts` deleted. Passes on both. |
| `REQ-plugins-1204` | "IDENTITY-6: the default ~/.config/corvidinho/allowlist.toml under a non-git $HOME project" > "the owner's session can't link an account or change a role through files-edit; write and delete are refused; other files are written" | child process, `HOME` the project: owner session true; link and role edits (relative and absolute), write and delete refused with `refused (IDENTITY-6)` and `/admin people`; `notes.txt` written; file unchanged. Fails on base. |
| `REQ-plugins-1204` | same describe > "creating the other default file, which the loader would read first, is refused" | only `allowlist.json` present: creating `allowlist.toml` and overwriting `allowlist.json` refused; neither changed. Fails on base. |
| `REQ-plugins-1204` | "isAllowlistFilePath" > "judges the loaded file, both default paths and a dangling link's target, and nothing else" | both default paths (missing) true; `other.toml`, `~/allowlist.toml` false; a dangling default link's target true; `CORVIDINHO_ALLOWLIST_FILE=~/team/allow.toml` true, a sibling false. Fails on base (no export). |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
