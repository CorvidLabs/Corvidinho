---
change: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
artifact: plan
---

# Plan

1. Regression tests first (tests/github.gate-allowlist-file.test.ts and a
   /work default-gate case in tests/work.pr.test.ts); watch them fail.
2. `checkRepoGateForActingRole` loads file + env; add `checkRepoGateAsync`;
   /work PR default gate uses it.
3. Deltas REQ-plugins-253 and REQ-discord-253; list the new test file in the
   plugins spec.
4. tsc, full test suite, SpecSync checks and the verify lane.
