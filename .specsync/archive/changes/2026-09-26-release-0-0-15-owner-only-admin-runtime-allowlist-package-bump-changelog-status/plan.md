---
change: release-0-0-15-owner-only-admin-runtime-allowlist-package-bump-changelog-status
artifact: plan
---

# Plan

1. Bump package + CHANGELOG + STATUS + tests + release.yml slash list.
2. `bun test` / `tsc` / `specsync check --require-coverage 100` / `change audit`.
3. PR as corvid-agent, merge, annotated tag `v0.0.15`, let release.yml publish.
4. Update live checkout via `corvidinho-update.sh`, re-register slash, confirm `/admin`.
