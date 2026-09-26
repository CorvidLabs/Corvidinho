---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: context
---

# Context

PR #1 CI failed with `specsync: command not found` (install.sh 404). Leif/CoS
(2026-09-26): SpecSync SDD ON; wire SpecSync via the **official org GitHub
Action only** — no curl|bash install. Prefer a dedicated Spec Sync workflow
(raven-shaped, ubuntu-latest) so Actions shows SpecSync clearly. Keep Fledge
verify in `ci.yml` via release binary (`@v1` major tag not published yet).

## Design decisions

- `.github/workflows/spec-sync.yml`: `CorvidLabs/spec-sync@v6` with
  `version: "6.0.0"`, `strict: true`, `require-coverage: "100"`, then
  `specsync change audit` (Action leaves binary on PATH).
- `ci.yml`: Bun 1.4.2 (matches bun.lock), smoke/test/typecheck, Fledge v1.7.2
  release binary + checksum + verify lane. No SpecSync steps.
- `fledge.toml` verify/ci lanes drop `spec-check` so smoke does not need SpecSync.
- `.specsync/sdd.json` enabled with require_change_for_meaningful_files.
