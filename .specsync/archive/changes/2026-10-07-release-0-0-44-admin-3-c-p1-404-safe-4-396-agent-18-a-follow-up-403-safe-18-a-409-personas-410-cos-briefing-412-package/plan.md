---
change: release-0-0-44-admin-3-c-p1-404-safe-4-396-agent-18-a-follow-up-403-safe-18-a-409-personas-410-cos-briefing-412-package
artifact: plan
---

# Plan

1. Bump `package.json` to 0.0.44; update version fixtures.
2. Fold CHANGELOG Unreleased into 0.0.44; refresh STATUS (As of 2026-10-07 + Done row).
3. Add REQ-cli-436 to living cli requirements + SpecSync delta.
4. Approve → verify → review → accept (tip-orphan archive after squash if finalize hangs).
5. After CI tags v0.0.44: cut live checkout to the release SHA; restart bridge + github-watch; Discord announce in allowlisted main channel.
