---
change: allowlist-loader-expands-a-leading-in-corvidinho-allowlist-file-to-home-so-the-documented-env-example-no-longer
artifact: tasks
---

# Tasks

- [x] Regression tests for the `~` value (resolver, loader, owner, doctor, `/admin`, `.env.example` end to end); new cases fail on `main`.
- [x] `resolveAllowlistPath` expands a leading `~` / `~/` against `home`; `~user`, absolute and relative values unchanged.
- [x] `.env.example` comment says how `~` is read.
- [x] Delta modifies REQ-plugins-006; plugins spec Public API note and files list updated.
- [x] specsync check, hi check, tsc, bun test, fledge verify green.
