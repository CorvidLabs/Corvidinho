# Lesson bundle — add-tag-v-github-release-action-with-verbose-notes-and-scripts-corvidinho-update-sh-for-safe-box-pull-install-doctor

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Add tag v* GitHub Release Action with verbose notes and scripts/corvidinho-update.sh for safe box pull install doctor restart rollback without Discord panic spam; land orphaned 0.0.2 SpecSync archive tip
- **Kind**: Operations
- **Paths**: .github/workflows/release.yml, scripts/corvidinho-update.sh, docs/BOX-UPDATE.md, STATUS.md
- **Acceptance**: On push tag v*, GitHub Action creates a GitHub Release with verbose notes (changelog + upgrade steps); scripts/corvidinho-update.sh safely pulls/checkouts target ref, bun install, doctor, restarts bridge only after health checks, rolls back previous tip if unhealthy, never Discord-spam on failure; docs/BOX-UPDATE.md documents usage; STATUS notes the updater + release Action; orphaned 0.0.2 SpecSync change archived on main; SpecSync audit green; fledge verify green

## Evidence

- Verification commit: `dffbb59dabd45e65ebcc8a1171f1cb303751a279`
- Base commit: `6cf991abc8e908fe55426b9a6b19d507f394cb1e`
- Verified by: `specsync check --spec cli`

## From the change's context.md

# Context

v0.0.2 product tip merged (#34) and tagged/released, but the SpecSync archive tip
was still only on the PR branch (early squash). Leif wants: (1) tag `v*` → GitHub
Release with verbose notes via Action; (2) a safe box updater that pulls, installs,
doctors, restarts the bridge, and rolls back if unhealthy — without Discord panic
spam. Durable session DB is out of scope.

## From the change's testing.md

# Testing

- `bash -n scripts/corvidinho-update.sh` syntax check.
- Dry-run script with `CORVIDINHO_UPDATE_DRY_RUN=1` against this checkout (no restart).
- `fledge lanes run verify --non-interactive` + `specsync change audit`.
- Workflow YAML validates via CI on PR (Action only fires on tags).

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| (ops AC) | Files present: release.yml, corvidinho-update.sh, BOX-UPDATE.md; bash -n; dry-run; audit green |

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
