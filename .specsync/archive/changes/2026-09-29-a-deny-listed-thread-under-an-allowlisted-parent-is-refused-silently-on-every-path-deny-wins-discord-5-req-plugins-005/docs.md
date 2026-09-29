---
change: a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005
artifact: docs
---

# Docs

- `docs/discord.md`: "Deny behavior" gains the "Deny always wins" paragraph
  (a deny-listed thread, or a thread under a deny-listed parent, is refused
  on every path; the parent's other threads keep working); the
  `discord-send-file` gates line says a deny-listed thread is refused.
- `specs/discord/discord.spec.md`: files add
  `tests/discord.thread-deny.test.ts`; Public API names
  `isMonitoredConversation`; Invariants (MessageCreate gate, restart
  recovery, `discord-send-file`) and Error Cases say deny wins.
  `specs/discord/testing.md`: new section.
- `specs/plugins/plugins.spec.md`: Public API names `isChannelDenied`;
  `specs/plugins/testing.md`: new section.
- `docs/DISCORD-GO-LIVE.md` and README say nothing this change makes false
  (GO-LIVE already says deny wins for channels), so they are unchanged. No
  STATUS / CHANGELOG / package version edits.
