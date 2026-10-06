---
change: the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for
artifact: requirements
---

# Requirements

- AUTONOMY-10.b (captured with `hi` in this change, `hi/autonomy.md`, from
  Leif's 2026-09-28 interview, round 16): "The fixed 'bridge is live' note it
  posts after a restart is system text, not an announcement, so it doesn't
  wait for my OK."
- Kept: DISCORD-ANNOUNCE-4 (the note posts after every successful restart,
  only to the announcements channel), PERSONA-1.a (one in-voice line with the
  release notes link), AUTONOMY-10 / 10.a (every `discord-post-message` and
  each of the first 20 public-thread replies that carry model text still
  wait), SAFE-6 (the note is scrubbed, mass mentions defanged).
- Modified: REQ-discord-024 (the bridge-live post) gains the AUTONOMY-10.b
  clauses: no Approve card, no reply-gate hold, no count toward the 20, the
  note stays model-free, the exemption covers only the bridge's own note, and
  docs/discord.md's must-ask list cites AUTONOMY-10.b.
- No env var, config key, flag, slash command, table, schema or package
  version change.
