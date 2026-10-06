---
change: in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2
artifact: lesson-bundle
---

# Lesson bundle — in-a-trust-repo-the-verify-gate-also-runs-fledge-trust-verify-after-the-lane-both-must-pass-and-trust-toml-is-safe-2

AGENT-18 Trust tip orphan after #364. Squash left the change verifying with a
pre-squash verification commit that is not the tip; archive clears the active
change so later lands do not inherit a stale verifying workspace (same class as #366 / #363).
