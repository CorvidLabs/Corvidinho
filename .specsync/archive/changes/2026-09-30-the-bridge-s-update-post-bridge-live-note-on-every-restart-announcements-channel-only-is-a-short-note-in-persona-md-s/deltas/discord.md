---
module: discord
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
---

# Delta — discord (the update post is a short note in the persona's voice linking the release notes)

## Modified

### REQUIREMENT REQ-discord-024

(Clarify bridge-live content only.) After every successful bridge restart
(`ClientReady`), when configured, Corvidinho SHALL post the update note from
`formatBridgeLiveAnnouncement` (REQ-discord-025) via `postAnnouncement`
— never to the general allowlisted chat by default (DISCORD-ANNOUNCE-4). The
note SHALL be one short line in the persona's voice naming the running version
with a link to that version's release notes (PERSONA-1.a), posted as one
message; it SHALL NOT carry CHANGELOG bullets (the bare `bridge live vX.Y.Z`
header and the ≤5 CHANGELOG bullets of package 0.0.11 are replaced). Package
version history for `/announce` slash itself remains **0.0.8**; the bullets
shipped in **0.0.11**.

Acceptance Criteria
- ClientReady posts bridge-live note only to announce channel (not dogfood allowlist).
- Note content matches REQ-discord-025 (one in-voice line with the version and the release notes link; no bullets).
- `/announce` slash + persist behavior from REQ-discord-024 otherwise unchanged.
- Through `startBridge`, one ClientReady gives exactly one post, to the announcements channel, pinging nobody; with no announcements channel nothing is posted.

### REQUIREMENT REQ-discord-025

`formatBridgeLiveAnnouncement` SHALL give the Discord-friendly bridge-live
note the bridge posts after every successful restart when an announce channel
is configured (DISCORD-ANNOUNCE-4): the update post, a short note in the
persona's voice (`persona.md`: warm, direct, an emoji, never a flat changelog)
with a link to the release notes, not a changelog dump (PERSONA-1.a, #69).

For a plain release version `X.Y.Z` (each part 1–6 digits; a leading `v` and
surrounding spaces dropped) the note SHALL be exactly one line:
`Back online and running **vX.Y.Z** 🐦‍⬛ Everything new in this version is in the release notes 👀 <https://github.com/CorvidLabs/Corvidinho/releases/tag/vX.Y.Z>`
— the version, one plain sentence and the link to that version's GitHub
Release (every package version has a `vX.Y.Z` tag and Release,
`.github/workflows/release.yml`), built from `CORVIDINHO_URL` and wrapped in
`<>` so Discord shows no preview card. Any other version (empty, a
pre-release, a mention, markdown, a secret, an over-long part) SHALL NOT be
echoed: the note is then `Back online 🐦‍⬛ Everything new is in the release notes 👀 <https://github.com/CorvidLabs/Corvidinho/releases>`.
The note SHALL be a fixed template: no model call and no spend, nothing read
from `CHANGELOG.md` or `package.json` beyond the package version, no bullet,
heading or newline, under 200 characters (always under 400); it SHALL be SAFE-6
scrubbed and have `@everyone` / `@here` defanged. Posts remain **only** via
`postAnnouncement` to the configured announce channel (never dogfood
allowlist by default), and the gateway reply parses no mentions
(REQ-discord-205). Editing `persona.md` does not change the template.

No new slash command, config key, env var or schema change; no package
version bump. Fixture tests without live Discord.

Acceptance Criteria
- A plain release version gives exactly the one-line template: `**vX.Y.Z**`, the persona's 🐦‍⬛ / 👀, and `<https://github.com/CorvidLabs/Corvidinho/releases/tag/vX.Y.Z>`; a leading `v` and spaces are dropped; the default is the package version.
- No `bridge live` header, no `-` / `*` bullet or heading line, no newline and no CHANGELOG text, even when CHANGELOG.md has a long section for that version; under 400 characters for the longest plain version.
- A version that is not a plain release version (empty, pre-release, `@everyone` / `@here`, a fake key, a newline bullet, markdown, a 20-digit part) is never echoed; the note links the Releases page.
- The note is unchanged by `scrubSecrets` and carries no `@everyone` / `@here`.
- `postAnnouncement` still default-deny / announce-channel-only, sending the note as one message.
- Regression tests in `tests/discord.update-post.test.ts` fail on the base sources and pass after.
