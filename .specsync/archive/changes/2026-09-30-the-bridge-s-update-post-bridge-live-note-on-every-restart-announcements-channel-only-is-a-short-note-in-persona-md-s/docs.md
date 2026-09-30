---
change: the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s
artifact: docs
---

# Docs

- `docs/discord.md`: Announcements section describes the in-voice update note
  (example line, fixed template, no preview card, pings nobody, scrubbed,
  odd versions link the Releases page) instead of the header + ≤5 bullets;
  criteria line links `hi/persona.md` (PERSONA-1.a).
- `docs/DISCORD-GO-LIVE.md` (E.8 Persona file): the bridge-live note is written
  in the persona's voice, one line linking the release notes, and editing
  `persona.md` does not change it.
- `README.md` (Persona): the same, one sentence.
- Specs: `specs/discord/discord.spec.md` (update post prose, `files:` +
  `tests/discord.update-post.test.ts`), `specs/discord/testing.md` (evidence);
  delta Modified REQ-discord-024 / REQ-discord-025.
- `hi/persona.md` + `INTENT.md` (index row) from the `hi` capture.
- No new config key, env var, CLI flag or slash command; no CHANGELOG section
  or package bump (release cut does that).
