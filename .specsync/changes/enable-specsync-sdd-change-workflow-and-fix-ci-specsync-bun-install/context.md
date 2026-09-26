---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: context
---

# Context

Standing order from Leif/CoS: SpecSync SDD / change cycle is ON. Prior bootstrap left `.specsync/sdd.json` with `enabled: false` and `require_change_for_meaningful_files: false`.

CI on PR #1 failed for two reasons:
1. `curl …/spec-sync/main/install.sh` returns 404 (no install.sh on main).
2. Workflow pinned Bun `1.2.21` while `bun.lock` is lockfileVersion 2 from Bun 1.4.x ("Unknown lockfile version" / frozen lockfile).

Adopted workflow-v2 baseline via `specsync change adopt`. This change enables SDD enforcement and repairs CI so verify can go green before merge.

## Lesson

SpecSync release tarball extracts a binary named `specsync-linux-<arch>`, not `specsync`. CI must `install`/`mv` it onto `$PATH` as `specsync`.
