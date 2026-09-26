---
change: tag-push-v-creates-idempotent-verbose-github-release-scripts-corvidinho-update-sh-safe-box-update-with-sha-record
artifact: testing
---

# Testing

- Unit (bash helpers via bun spawn): `log_indicates_ready` true for logged-in / protocol OK lines; false for unrelated noise.
- Unit: `extract_changelog_section` returns matching version body when present.
- Smoke: `bash -n scripts/corvidinho-update.sh` syntax check.
- Workflow YAML present and triggers on `v*` (file assert in test).
- `bun test` + `fledge lanes run verify --non-interactive`.

## Automated coverage

- `bun test tests/update-helpers.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`
