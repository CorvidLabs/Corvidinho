---
change: harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml
artifact: tasks
---

# Tasks

- [x] (a) `/admin` mutations refuse with `audit log unavailable (SAFE-5)` when `recordAudit` is unset.
- [x] (b) Shared `isJsonAllowlistPath` used by `loadAllowlistFile` and `allowlistFileFormat`.
- [x] (c) `danglingSymlinkError` guards plan, `readAdminFileView` and `writeFileAtomic`; the link is never replaced.
- [x] (d) `normalizeFileFilter`; an empty `--file` is a usage error with no API call.
- [x] (e) `noPatchNote` gives the content-unchanged wording for rename, copy and mode changes; `copy from`/`copy to` lines are added.
- [x] Regression tests in tests/discord.admin-slash.test.ts and tests/github.review.plugin.test.ts.
- [x] Modified deltas for REQ-discord-043 and REQ-plugins-093.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, fledge verify.
