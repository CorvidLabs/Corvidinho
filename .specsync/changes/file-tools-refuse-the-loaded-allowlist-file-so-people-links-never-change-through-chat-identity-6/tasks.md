---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: tasks
---

# Tasks

- [x] Confirm IDENTITY-6 and ALLOW-6 are captured on main (`hi/identity.md`, `hi/allow.md`); nothing new to capture; `hi check` passes.
- [x] `plugins/files/protectedPaths.ts`: `allowlistFilePaths`, `isAllowlistFilePath`, `allowlistFileRefuseMessage` over `resolveAllowlistPath` / `defaultAllowlistPaths`.
- [x] `plugins/files/commands.ts`: `refuseProtected` refuses the allowlist file (exit 2) for `files-write`, `files-edit` and `files-delete`.
- [x] `tests/files.allowlist-file.test.ts` (7 tests); fail-on-base proof recorded in testing.md.
- [x] `docs/discord.md` "Declared people", spec prose (public API, invariant, scenario, error row, files list), delta and module testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
