---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md` (ROLES-CHAT run time): the `(not allowed for your
  role)` line is kept when chat replies, `/session start` / `/work` answers,
  schedule posts and run history, a SAFE-8-shortened reply and the WATCH
  summary comment cut a long reply.
- `docs/WATCH.md` run summary: the 1200-char clip keeps the closing line.
- `docs/discord.md` outbound formats: a cut keeps the closing line (REQ-discord-734).
- `specs/discord/discord.spec.md`: Public API names `POST_SUMMARY_MAX` /
  `clipPostSummary` and the note-keeping `appendPostLine`; Invariants add
  REQ-discord-734. `specs/watch/watch.spec.md` Invariants add REQ-watch-734.
- `specs/discord/testing.md`, `specs/watch/testing.md`: requirement test lines.
- No new files (no `files:` change); no CHANGELOG / STATUS / package version edits.
