---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: tasks
---

# Tasks

- [x] Enable SDD (`enabled` + `require_change_for_meaningful_files`) + workflow-v2 baseline
- [x] Pin Bun 1.4.2 in CI to match bun.lock
- [x] Add dedicated `.github/workflows/spec-sync.yml` with `CorvidLabs/spec-sync@v6` + change audit
- [x] Remove SpecSync curl/binary install from `ci.yml`
- [x] Drop Fledge install / `fledge lanes run verify` from `ci.yml` (local-only for now)
- [x] Action `strict: false` for draft bootstrap specs; keep require-coverage 100
- [x] Local `specsync check`, `specsync change audit`, `fledge lanes run verify --non-interactive` green
