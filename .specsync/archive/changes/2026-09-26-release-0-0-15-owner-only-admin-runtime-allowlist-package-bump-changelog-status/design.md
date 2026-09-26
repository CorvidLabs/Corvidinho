---
change: release-0-0-15-owner-only-admin-runtime-allowlist-package-bump-changelog-status
artifact: design
---

# Design

Version-only operations cut:

1. `package.json` → `0.0.15`.
2. `CHANGELOG.md` section for 0.0.15 (ADMIN-1..4 bullets; ≤5 short lines for DISCORD-ANNOUNCE-4).
3. `STATUS.md` repo line + Done rows for #43/#147.
4. Version / changelog-helper tests expect `0.0.15`.
5. `.github/workflows/release.yml` slash list includes `/admin` so tag release notes match the nine-command set.
