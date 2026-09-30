---
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
artifact: design
---

# Design

- **Which post.** The one update post is the bridge-live note
  (`onReady` in `src/discord/bridge.ts` → `formatBridgeLiveAnnouncement` →
  `postAnnouncement`, announcements channel only). The updater script posts
  nothing to Discord, so nothing changes there. The bridge call site is
  unchanged (`formatBridgeLiveAnnouncement(version)`), only its text.
- **Text.** A fixed template in the drafted persona's voice (warm, direct,
  its 🐦‍⬛ / 👀 emoji, one plain sentence, no changelog voice):
  `Back online and running **vX.Y.Z** 🐦‍⬛ Everything new in this version is in
  the release notes 👀 <https://github.com/CorvidLabs/Corvidinho/releases/tag/vX.Y.Z>`.
  "Back online" is true for every ClientReady (a plain restart on the same
  version too); it does not claim a new version or name any feature.
- **Why no model.** The persona is applied by hand in the template: no model
  call, no spend, no provider needed at startup, same text every time, and no
  model-written text in an announcements post. Editing `persona.md` does not
  change it (pending Leif, below).
- **Link.** Every package version gets a `vX.Y.Z` tag and GitHub Release
  with verbose notes (release.yml, `release_notes`), so the link goes to
  `${CORVIDINHO_URL}/releases/tag/vX.Y.Z` (`src/attribution.ts`, no new
  constant for the repo). It is wrapped in `<>` so Discord does not unfurl a
  preview card of the long notes under the short note.
- **Safety.** Only a plain `X.Y.Z` (1–6 digit parts) is echoed; anything
  else gives the Releases-page note without the input, so a strange
  package.json value can never inject a mention, markdown, a link or a secret.
  The result still goes through `scrubSecrets` and `defangMassMentions`, and
  the gateway reply parses no mentions (REQ-discord-205). One `postAnnouncement`
  call, one message.
- **Removed.** `extractChangelogSection`, `changelogBulletsFromSection`,
  the meta-bullet filter, the CHANGELOG / package description readers and
  `FormatBridgeLiveOpts`: internal to `announce.ts`, not re-exported, no other
  caller. The shell `extract_changelog_section` stays (release notes).
- **Unchanged:** `postAnnouncement` (default-deny, 1900 cap), `/announce`,
  `/status`, the backup notice, the persona file and its loading, schema,
  config, env, package version.
- **Chosen conservatively (pending Leif):** a fixed template, not persona.md
  applied by a model, so a persona edit does not change the note; a pre-release
  or odd version is not echoed (Releases page instead); the link preview is
  suppressed; the note does not name any feature from the release (no summary
  line), only the link; the same note after a plain restart as after an
  update.
