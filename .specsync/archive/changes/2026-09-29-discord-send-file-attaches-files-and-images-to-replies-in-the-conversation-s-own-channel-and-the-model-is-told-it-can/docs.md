---
change: discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can
artifact: docs
---

# Docs

- `docs/discord.md`: new "Files and images in replies (DISCORD-17)" section
  (channel, gates, types, 8 MB, scrub, refused paths, dry run); the mention
  section and the limits table name the `discord-send-file` caption and the
  attachment cap.
- `docs/DISCORD-GO-LIVE.md`: Server Members Intent note covers
  `discord-send-file`; E.3 table gains its row.
- `specs/discord/discord.spec.md`: files add `plugins/discord/send-file.ts`
  and `tests/discord.send-file.test.ts`; Public API, Invariants and Error
  Cases for REQ-discord-476. `specs/discord/testing.md`: test line.
- `specs/agent/agent.spec.md`: Public API + Invariant for REQ-agent-476;
  `specs/agent/testing.md`: test line.
- No README / STATUS / CHANGELOG / package version edits (release PRs own
  those; README does not list tools).
