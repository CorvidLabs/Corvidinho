---
id: add-tag-v-github-release-action-with-verbose-notes-and-scripts-corvidinho-update-sh-for-safe-box-pull-install-doctor
state: implementing
type: operations
base_commit: 6cf991abc8e908fe55426b9a6b19d507f394cb1e
---

# Add tag v* GitHub Release Action with verbose notes and scripts/corvidinho-update.sh for safe box pull install doctor restart rollback without Discord panic spam; land orphaned 0.0.2 SpecSync archive tip

## Intent

Add tag v* GitHub Release Action with verbose notes and scripts/corvidinho-update.sh for safe box pull install doctor restart rollback without Discord panic spam; land orphaned 0.0.2 SpecSync archive tip

## Affected Canonical Specs

- None

## Acceptance Criteria

- On push tag v*, GitHub Action creates a GitHub Release with verbose notes (changelog + upgrade steps); scripts/corvidinho-update.sh safely pulls/checkouts target ref, bun install, doctor, restarts bridge only after health checks, rolls back previous tip if unhealthy, never Discord-spam on failure; docs/BOX-UPDATE.md documents usage; STATUS notes the updater + release Action; orphaned 0.0.2 SpecSync change archived on main; SpecSync audit green; fledge verify green

## No-spec Rationale

CI release workflow and operator box-update shell script; no living module acceptance criteria change
