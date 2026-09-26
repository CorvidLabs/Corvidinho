---
change: tag-push-v-creates-idempotent-verbose-github-release-scripts-corvidinho-update-sh-safe-box-update-with-sha-record
artifact: plan
---

# Plan

1. Add `.github/workflows/release.yml` on `push` tags `v*`: verbose `softprops/action-gh-release` (or `gh release create`) with body from CHANGELOG section when present, else generated notes; skip/succeed if release already exists.
2. Add `scripts/lib/update-helpers.sh` (testable match/rollback helpers) + `scripts/corvidinho-update.sh` orchestrating fetch → record SHA → checkout → bun install → optional doctor → stop via pidfile → start with documented env → wait for ready → rollback+restart on timeout.
3. Add `docs/UPDATE.md` pointing at releases + update script + secrets pattern.
4. Bump `package.json` to `0.0.3`; note in `STATUS.md`; bun tests for helper predicates.
5. SpecSync approve → check → implement → review → ship; merge when CI green; tag `v0.0.3` + verbose release.
