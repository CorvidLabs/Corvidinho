---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: tasks
---

# Tasks

- [x] Enable SDD (`enabled` + `require_change_for_meaningful_files`) and adopt workflow-v2 baseline
- [x] Pin Bun 1.4.2 in CI to match bun.lock
- [x] Add dedicated `.github/workflows/spec-sync.yml` with `CorvidLabs/spec-sync@v6` + change audit
- [x] Remove SpecSync curl/binary install and bare check from `ci.yml`
- [x] Install Fledge from pinned v1.7.2 release binary + checksum; keep verify lane
- [x] Drop `spec-check` from Fledge verify/ci lanes
- [x] Local `specsync check`, `specsync change audit`, `fledge lanes run verify --non-interactive` green
