---
change: enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11
artifact: design
---

# Design

`formatBridgeLiveAnnouncement(version, opts?)` reads CHANGELOG.md (or injected
`changelogText`), takes the `## <version>` section, collects `-` bullets
(skipping Ops-only package/restart/HI-captured lines), truncates each for
Discord, caps at 5. Missing/empty → package description or single tip line.
Still posted only via `postAnnouncement` (DISCORD-ANNOUNCE-4).
