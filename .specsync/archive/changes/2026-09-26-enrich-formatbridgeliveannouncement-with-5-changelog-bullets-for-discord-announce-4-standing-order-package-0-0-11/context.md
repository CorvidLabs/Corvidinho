---
change: enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11
artifact: context
---

# Context

Leif standing order: every Discord bridge restart/update should post a message
summarizing **new features/version**, not only `bridge live **vX**`.
`formatBridgeLiveAnnouncement` in tip v0.0.10 still returns only the bare
version line. DISCORD-ANNOUNCE-4 already requires posting the update only to
the configured announce channel — this change enriches that note from
CHANGELOG.md (≤5 bullets) without inventing new HI.
