---
change: cover-leftover-update-helpers-0-0-9-changelog-fixture-for-specsync-audit-after-shell-exec-archive
artifact: context
---

# Context

Shell-exec SAFE-3 (#83) archived while tests/update-helpers.test.ts still carries a
new extract_changelog_section fixture for 0.0.9. SpecSync change audit refuses the
PR until that path is covered by an active change. No new product AC.
