---
change: release-0-0-15-owner-only-admin-runtime-allowlist-package-bump-changelog-status
artifact: testing
---

# Testing

- `bun src/cli.ts version` → `0.0.15`
- `bun test tests/version.test.ts tests/update-helpers.test.ts`
- `bun test` full suite
- `bunx tsc --noEmit`
- `specsync check --require-coverage 100`
- After merge: bridge restart posts `v0.0.15` presence; `/admin` registered (nine guild commands)
