---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: testing
---

# Testing

## Local

- `specsync check --force` exits 0
- `specsync change audit` exits 0
- `fledge lanes run verify --non-interactive` green without SpecSync on PATH for the lane

## CI

- **Spec Sync** workflow: Action + change audit
- **ci** smoke: Bun + Fledge release install + verify; no SpecSync curl/Action in this job

## Rejection signal

Any curl|bash SpecSync install, SpecSync only buried in smoke with no dedicated
workflow, or `sdd.json` `enabled: false` means the change is wrong.
