---
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
artifact: requirements
---

# Requirements

HI: PERSONA-1.a (`hi/persona.md`, captured in this PR from Leif's 2026-09-28
interview, round 12), under PERSONA-1; DISCORD-ANNOUNCE-4 unchanged.

- REQ-discord-025 (modified): `formatBridgeLiveAnnouncement` gives one line
  in the persona's voice, `Back online and running **vX.Y.Z** 🐦‍⬛ Everything
  new in this version is in the release notes 👀 <…/releases/tag/vX.Y.Z>`;
  fixed template, no model call, nothing from CHANGELOG.md, no bullets, under
  200 characters, scrubbed and defanged; a version that is not a plain
  `X.Y.Z` is never echoed and the note links the Releases page.
- REQ-discord-024 (modified): the ClientReady post is that note, one message,
  announcements channel only; CHANGELOG bullets are gone.

Unchanged: DISCORD-ANNOUNCE-1..6 behaviour (`/announce channel|show`,
default-deny, announce-channel-only, ADMIN re-check, persistence),
REQ-discord-205 (no parsed mentions), the backup notice (REQ-discord-680),
REQ-agent-069 (the persona file and its loading), the GitHub Release notes
(`release_notes` in `scripts/lib/update-helpers.sh`).
