---
change: enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11
artifact: plan
---

# Plan

1. Parse CHANGELOG.md section for the package version; extract ≤5 short bullets.
2. Enrich `formatBridgeLiveAnnouncement`; keep `postAnnouncement` announce-only.
3. Fixture tests; bump package 0.0.11; docs/STATUS/CHANGELOG; SpecSync + verify.
