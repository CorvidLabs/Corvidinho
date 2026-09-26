---
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
artifact: tasks
---

# Tasks

- [x] Regression tests fail before the fix (5/5 new plugin gate tests, 1 /work default-gate test).
- [x] GitHub plugin gate loads the allowlist file + env overlays (`loadAllowlist`).
- [x] `checkRepoGateAsync` added; /work PR default gate uses it.
- [x] Deltas REQ-plugins-253 / REQ-discord-253 and plugins spec file list updated.
- [x] tsc, full test suite, SpecSync checks and verify lane green.
