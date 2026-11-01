---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: plan
---

# Plan

1. Confirm IDENTITY-6 and ALLOW-6 are captured on main; nothing to capture;
   `hi check`.
2. Add `allowlistFilePaths` / `isAllowlistFilePath` /
   `allowlistFileRefuseMessage` to `plugins/files/protectedPaths.ts`.
3. Refuse it in `refuseProtected` (`plugins/files/commands.ts`).
4. `tests/files.allowlist-file.test.ts`: env file inside a non-git project
   (in-process, owner session), default path under a non-git `$HOME`
   project (child process), symlink / hard link, other files, unit case.
   Prove it fails on the base sources.
5. Spec prose, delta, module testing evidence, `docs/discord.md`.
6. `specsync check --require-coverage 100`, `hi check`,
   `bunx tsc --noEmit`, `bun test`,
   `fledge lanes run verify --non-interactive`.
