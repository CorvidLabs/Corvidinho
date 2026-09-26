---
change: add-tag-v-github-release-action-with-verbose-notes-and-scripts-corvidinho-update-sh-for-safe-box-pull-install-doctor
artifact: context
---

# Context

v0.0.2 product tip merged (#34) and tagged/released, but the SpecSync archive tip
was still only on the PR branch (early squash). Leif wants: (1) tag `v*` → GitHub
Release with verbose notes via Action; (2) a safe box updater that pulls, installs,
doctors, restarts the bridge, and rolls back if unhealthy — without Discord panic
spam. Durable session DB is out of scope.
