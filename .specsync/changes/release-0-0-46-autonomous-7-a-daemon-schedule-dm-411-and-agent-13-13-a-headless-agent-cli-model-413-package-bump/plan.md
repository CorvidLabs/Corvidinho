---
change: release-0-0-46-autonomous-7-a-daemon-schedule-dm-411-and-agent-13-13-a-headless-agent-cli-model-413-package-bump
artifact: plan
---

# Plan

1. Bump `package.json` to 0.0.46; update version fixtures.
2. Fold CHANGELOG Unreleased into 0.0.46; refresh STATUS (As of 2026-10-07 + Done row for AUTONOMOUS-7.a + AGENT-13/13.a).
3. Add REQ-cli-438 to living cli requirements + SpecSync delta.
4. Approve → verify → review → accept (tip-orphan archive after squash if finalize hangs).
5. After CI tags v0.0.46: cut live checkout to the release SHA; restart bridge + github-watch; Discord announce in allowlisted main channel.
