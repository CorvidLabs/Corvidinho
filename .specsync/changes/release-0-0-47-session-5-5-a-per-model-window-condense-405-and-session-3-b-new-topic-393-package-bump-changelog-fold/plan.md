---
change: release-0-0-47-session-5-5-a-per-model-window-condense-405-and-session-3-b-new-topic-393-package-bump-changelog-fold
artifact: plan
---

# Plan

1. Bump `package.json` to 0.0.47; update version fixtures.
2. Fold CHANGELOG Unreleased into 0.0.47; refresh STATUS.
3. Add REQ-cli-439 to living cli requirements + SpecSync delta.
4. Approve → verify → review → accept (tip-orphan archive after squash if finalize hangs).
5. After CI tags v0.0.47: cut live checkout to the release SHA; restart bridge + github-watch; Discord announce.
