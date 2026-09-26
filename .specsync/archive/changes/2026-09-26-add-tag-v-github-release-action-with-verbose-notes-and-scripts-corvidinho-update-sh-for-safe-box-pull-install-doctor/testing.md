---
change: add-tag-v-github-release-action-with-verbose-notes-and-scripts-corvidinho-update-sh-for-safe-box-pull-install-doctor
artifact: testing
---

# Testing

- `bash -n scripts/corvidinho-update.sh` syntax check.
- Dry-run script with `CORVIDINHO_UPDATE_DRY_RUN=1` against this checkout (no restart).
- `fledge lanes run verify --non-interactive` + `specsync change audit`.
- Workflow YAML validates via CI on PR (Action only fires on tags).

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| (ops AC) | Files present: release.yml, corvidinho-update.sh, BOX-UPDATE.md; bash -n; dry-run; audit green |
