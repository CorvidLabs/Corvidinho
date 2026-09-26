---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: plan
---

# Plan

1. Keep SDD `enabled: true` and set `require_change_for_meaningful_files: true`.
2. Commit adoption artifacts (`adoption-report.json`, `workflow-v2-baseline.json`).
3. Rewrite `.github/workflows/ci.yml` to:
   - Pin Bun to `1.4.2` (matches local lockfile writer).
   - Replace broken install.sh with `CorvidLabs/spec-sync@v6.0.0` (`version: "6.0.0"`).
   - Keep fledge verify; ensure SpecSync is on PATH for the fledge `spec-check` task (download binary into `~/.local/bin` if Action only runs check).
4. Update AGENTS.md / STATUS.md: SDD change cycle ON; merge allowed when verify+change green.
5. Local: `bun test`, `specsync check`, `fledge lanes run verify --non-interactive`.
6. Push to PR #1 tip; when CI green, SpecSync review/finalize then merge.
