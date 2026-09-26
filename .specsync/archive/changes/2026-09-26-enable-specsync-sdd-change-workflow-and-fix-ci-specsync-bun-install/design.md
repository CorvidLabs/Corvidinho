---
change: enable-specsync-sdd-change-workflow-and-fix-ci-specsync-bun-install
artifact: design
---

# Design

- **SDD policy**: single source of truth `.specsync/sdd.json`; change workspaces under `.specsync/changes/`.
- **CI SpecSync**: prefer official composite Action for `specsync check`. Separately ensure a `specsync` binary is on PATH so Fledge's `spec-check` task (`specsync check`) succeeds inside `fledge lanes run verify`.
- **Bun pin**: align `oven-sh/setup-bun` version with the lockfile that ships in-repo (1.4.2 / lockfileVersion 2).
- No product CLI/API behavior changes in this change.
