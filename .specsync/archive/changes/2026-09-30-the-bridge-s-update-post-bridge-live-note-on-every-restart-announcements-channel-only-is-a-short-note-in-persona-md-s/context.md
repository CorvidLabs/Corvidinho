---
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
artifact: context
---

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
