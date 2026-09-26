---
change: enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11
artifact: testing
---

# Testing

- Unit: changelog section → ≤5 bullets; missing CHANGELOG → description/tip fallback;
  header always `bridge live **vX**`.
- Existing `postAnnouncement` tests: still announce-channel-only; content may be multi-line.
- `fledge lanes run verify --non-interactive`.
