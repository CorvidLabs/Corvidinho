---
change: discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6
artifact: tasks
---

# Tasks

- [x] Regression test fails before the fix.
- [x] Scope gate in `resolveProjectDir` (real paths, sibling origin allowlist).
- [x] Session store, bridge, scheduler tick and `/schedule create` pass the allowlist.
- [x] Existing fixtures updated; full test suite, tsc and verify lane green.
