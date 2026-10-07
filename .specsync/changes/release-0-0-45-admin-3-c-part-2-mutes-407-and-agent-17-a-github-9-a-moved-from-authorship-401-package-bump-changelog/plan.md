---
change: release-0-0-45-admin-3-c-part-2-mutes-407-and-agent-17-a-github-9-a-moved-from-authorship-401-package-bump-changelog
artifact: plan
---

# Plan

1. Bump `package.json` to 0.0.45; update version fixtures.
2. Fold CHANGELOG Unreleased into 0.0.45; refresh STATUS (As of 2026-10-07 + Done row for mutes + authorship).
3. Add REQ-cli-437 to living cli requirements + SpecSync delta.
4. Approve → verify → review → accept (tip-orphan archive after squash if finalize hangs).
5. After CI tags v0.0.45: cut live checkout to the release SHA; restart bridge + github-watch; Discord announce in allowlisted main channel.
