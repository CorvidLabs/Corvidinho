---
id: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
state: archived
type: feature
base_commit: 6fad05359166545cbcf26065959406201fdc408a
---

# The bridge's update post (bridge-live note on every restart, announcements channel only) is a short note in persona.md's voice with the version and a link to that version's GitHub Release notes, never a CHANGELOG bullet dump: deterministic template, no model call, under 400 chars, one message, mass mentions defanged, scrubbed (PERSONA-1.a, #69)

## Intent

The bridge's update post (bridge-live note on every restart, announcements channel only) is a short note in persona.md's voice with the version and a link to that version's GitHub Release notes, never a CHANGELOG bullet dump: deterministic template, no model call, under 400 chars, one message, mass mentions defanged, scrubbed (PERSONA-1.a, #69)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- PERSONA-1.a captured in hi/persona.md with hi (hi check green); on ClientReady the bridge posts exactly one message, only to the configured announcements channel, whose text is a short note in persona.md's voice (warm, direct, an emoji) naming the running version and linking that version's GitHub Release notes (https://github.com/CorvidLabs/Corvidinho/releases/tag/v<version>); no CHANGELOG bullets or bullet lines even when the CHANGELOG has a section for the version; under 400 characters; built from a fixed template with no model call; @everyone / @here defanged and the text SAFE-6 scrubbed; a version that is not a plain release version is never echoed and the note links the Releases page instead; tests/discord.update-post.test.ts drives startBridge onReady with a fake reply and asserts the posted text, and fails on the base sources

## No-spec Rationale

Not applicable
