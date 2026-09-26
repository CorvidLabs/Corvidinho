---
change: add-tag-v-github-release-action-with-verbose-notes-and-scripts-corvidinho-update-sh-for-safe-box-pull-install-doctor
artifact: plan
---

# Plan

1. Land orphaned 0.0.2 SpecSync archive (already cherry-picked).
2. Add `.github/workflows/release.yml` on `push: tags: ['v*']` creating a Release with verbose body (notes from tag annotation / generated changelog).
3. Add `scripts/corvidinho-update.sh` + `docs/BOX-UPDATE.md`; STATUS pointer.
4. SpecSync check/review/ship → PR → squash-merge when green.
