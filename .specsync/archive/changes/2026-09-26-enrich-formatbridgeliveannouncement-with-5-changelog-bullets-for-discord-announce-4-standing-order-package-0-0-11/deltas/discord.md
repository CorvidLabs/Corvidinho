---
module: discord
change: enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11
---

# Delta — discord (enriched bridge-live announce)

## Added

### REQUIREMENT REQ-discord-025

`formatBridgeLiveAnnouncement` SHALL post a Discord-friendly bridge-live note
after every successful restart when an announce channel is configured
(DISCORD-ANNOUNCE-4): a version header `bridge live **vX.Y.Z**` plus a short
bullet list (≤5) of what shipped in the current package version.

Bullets SHALL prefer the matching `CHANGELOG.md` (or RELEASE notes) section for
that version. When CHANGELOG is missing or has no usable bullets, the helper
SHALL fall back to the package description or a single-line tip — never invent
features. Posts remain **only** via `postAnnouncement` to the configured
announce channel (never dogfood allowlist by default).

Package version SHALL bump to **0.0.11**. Fixture tests without live Discord.
No new slash commands; no new HI criteria (implements standing order + existing
DISCORD-ANNOUNCE-4).

Acceptance Criteria
- Header is always `bridge live **vX.Y.Z**`.
- With a CHANGELOG section, body has 1–5 short `-` bullets from that version.
- Missing CHANGELOG / empty section → description or tip fallback (or header-only if none).
- `postAnnouncement` still default-deny / announce-channel-only.
- Package `0.0.11`; docs/STATUS/CHANGELOG updated.
- Fixture tests + SpecSync + fledge verify green.

## Modified

### REQUIREMENT REQ-discord-024

(Clarify bridge-live content only.) After every successful bridge restart
(`ClientReady`), when configured, Corvidinho SHALL post the enriched bridge-live
note from `formatBridgeLiveAnnouncement` (REQ-discord-025) via `postAnnouncement`
— never to the general allowlisted chat by default (DISCORD-ANNOUNCE-4). The
bare `bridge live vX.Y.Z` one-liner is the minimum header; ship notes MAY include
≤5 CHANGELOG bullets. Package version history for `/announce` slash itself
remains **0.0.8**; current package is **0.0.11** after this enrichment.

Acceptance Criteria
- ClientReady posts bridge-live note only to announce channel (not dogfood allowlist).
- Note content matches REQ-discord-025 (header + optional ≤5 bullets).
- `/announce` slash + persist behavior from REQ-discord-024 otherwise unchanged.
