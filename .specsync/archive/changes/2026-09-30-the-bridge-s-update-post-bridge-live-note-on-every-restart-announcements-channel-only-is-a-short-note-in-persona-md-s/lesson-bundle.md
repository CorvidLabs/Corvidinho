# Lesson bundle — the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: The bridge's update post (bridge-live note on every restart, announcements channel only) is a short note in persona.md's voice with the version and a link to that version's GitHub Release notes, never a CHANGELOG bullet dump: deterministic template, no model call, under 400 chars, one message, mass mentions defanged, scrubbed (PERSONA-1.a, #69)
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/announce.ts, src/discord/bridge.ts, tests/discord.announce.test.ts, tests/discord.update-post.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, README.md, specs/discord/discord.spec.md, hi/persona.md, INTENT.md
- **Acceptance**: PERSONA-1.a captured in hi/persona.md with hi (hi check green); on ClientReady the bridge posts exactly one message, only to the configured announcements channel, whose text is a short note in persona.md's voice (warm, direct, an emoji) naming the running version and linking that version's GitHub Release notes (https://github.com/CorvidLabs/Corvidinho/releases/tag/v<version>); no CHANGELOG bullets or bullet lines even when the CHANGELOG has a section for the version; under 400 characters; built from a fixed template with no model call; @everyone / @here defanged and the text SAFE-6 scrubbed; a version that is not a plain release version is never echoed and the note links the Releases page instead; tests/discord.update-post.test.ts drives startBridge onReady with a fake reply and asserts the posted text, and fails on the base sources

## Evidence

- Verification commit: `85bdd767cf9af20fdcfd30334bde5edd503de8da`
- Base commit: `6fad05359166545cbcf26065959406201fdc408a`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #69 (PERSONA, milestone M1 "Knows everyone"). PERSONA-1..3 shipped in
#274 (`persona.md` loaded into every run). Its design left one call pending
Leif: "templated posts are not rewritten in the persona voice". Leif decided it
in the 2026-09-28 interview record, round 12 (2026-09-29): keep the drafted
`persona.md` voice (confirmed, no voice change) and make the bridge's update
post a short in-voice note linking the release notes instead of a changelog
bullet dump. Captured in this PR's first commit with `hi`:

- **PERSONA-1.a** "The drafted persona.md voice is confirmed, and its update
  posts are a short note in that voice with a link to the release notes, not
  a changelog dump." (parent **PERSONA-1** "It sounds like corvid-agent: warm,
  direct, with personality and emoji, never a flat changelog voice.")

Gap on main (5aaf7f0): the only update post is the bridge-live note the bridge
posts on every ClientReady to the `/announce` channel (DISCORD-ANNOUNCE-4,
REQ-discord-024/025). `formatBridgeLiveAnnouncement` built
`bridge live **vX.Y.Z**` plus up to five CHANGELOG bullets (each up to 160
chars); for 0.0.34 the post was 838 characters of bullets, a changelog dump in
a flat voice. `scripts/corvidinho-update.sh` posts nothing to Discord ("never
Discord-spam"); `scripts/lib/update-helpers.sh` `extract_changelog_section`
feeds only the GitHub Release notes and tag subjects (release.yml), which are
the release notes the note now links to, so it is unchanged.

Settled constraints: owner admins, the team works; v1 off-chain; no model call
or spend for a fixed bot post; #232 / #233 scope untouched; no schema, config
key, env var or package version change.

## From the change's design.md

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

## From the change's testing.md

# Testing

Fixture tests only: `startBridge` with a null gateway whose reply is
recorded, an in-memory DB with the announcements channel set, and the
template directly; no live Discord, no token, no network, no model.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-024` | `tests/discord.update-post.test.ts` ("PERSONA-1.a: the bridge's update post on ClientReady") | After `onReady` with `version` 0.0.34 (a long section in the real CHANGELOG.md): exactly one reply, to the announcements channel, no pinged users, equal to `formatBridgeLiveAnnouncement("0.0.34")`; with no announcements channel nothing is posted anywhere. |
| `REQ-discord-025` | `tests/discord.update-post.test.ts` ("one short in-voice note …") | The posted text is under 400 characters, carries `**v0.0.34**`, `<https://github.com/CorvidLabs/Corvidinho/releases/tag/v0.0.34>` and 🐦‍⬛, has no `bridge live` header, bullet or heading line, newline or "changelog", none of the version's CHANGELOG bullets, and `scrubSecrets` leaves it unchanged. |
| `REQ-discord-025` | `tests/discord.update-post.test.ts` ("PERSONA-1.a: formatBridgeLiveAnnouncement") | Exact template for 0.0.34; ` v1.2.3 ` → v1.2.3; default = package version; `999999.999999.999999` under 400 with the full link; empty, blank, `0.0.34-rc.1`, `@everyone`, `1.0.0 @here`, a runtime-built fake key, a newline bullet, markdown link text and a 20-digit part all give the Releases-page note without the input; `postAnnouncement` sends it once, as is, to the announcements channel. |
| `REQ-discord-024` | `tests/discord.announce.test.ts` ("postAnnouncement") | Default-deny when no channel; posts only to the configured channel with the new note. |

Fail on base: with main 5aaf7f0's `src/discord/announce.ts` swapped in, 5 of
the 7 tests in `tests/discord.update-post.test.ts` fail (the bridge posted an
838-character `bridge live **v0.0.34**` + bullets note; the template, default,
long-version and odd-version tests fail); the two that pass on base are the
no-channel and `postAnnouncement` cases. All 7 pass on the branch, and
`tests/discord.announce.test.ts` passes (9).

Full suite: `bun test` green; `bunx tsc --noEmit` clean; `specsync check
--require-coverage 100` 100%; `hi check` green; `fledge lanes run verify
--non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
