---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: plan
---

# Plan

1. Export `isJsonAllowlistPath` from `src/allowlist/load.ts` and use it in
   `loadAllowlistFile`.
2. In `src/discord/admin-allowlist.ts`:
   - `allowlistFileFormat` calls `isJsonAllowlistPath`.
   - Add `danglingSymlinkError`, and call it from `planAdminListChange`,
     `readAdminFileView` and `writeFileAtomic`.
3. In `src/discord/command-handlers/admin.ts`, when `recordAudit` is unset,
   refuse with the same SAFE-5 reply as when it throws.
4. In `plugins/github/review.ts`:
   - Add `normalizeFileFilter`, and refuse an empty `--file` with a usage
     error.
   - Add `noPatchNote`, and add `copy from`/`copy to` lines in
     `fileDiffSection`.
5. Add regression tests to `tests/discord.admin-slash.test.ts` and
   `tests/github.review.plugin.test.ts`.
6. Write the Modified deltas for REQ-discord-043 and REQ-plugins-093. Then run
   `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`
   and fledge verify.
