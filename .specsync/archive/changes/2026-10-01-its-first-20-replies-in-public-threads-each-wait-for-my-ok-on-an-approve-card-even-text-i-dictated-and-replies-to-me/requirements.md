---
change: its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me
artifact: requirements
---

# Requirements

- AUTONOMY-10 (captured on main): "It asks before announcements it starts and
  before its first 20 replies in public threads; GitHub comments and social
  posts don't need asking."
- AUTONOMY-10.a (captured on main in #319 from Leif's round 13): "Every
  channel post it makes, and each of its first 20 public-thread replies,
  waits for my OK, even text I dictated and replies to me."
- Kept: SAFE-18..20 (one card engine; the text verbatim before the card,
  scrubbed and fence-safe; no answer means no), SAFE-6 (scrub), AGENT-3.a /
  3.b (Stop button, the queue), DISCORD-3.b (failed-run lines), SAFE-8 /
  SAFE-14.a (spend-cap stop line and the spend card), DISCORD-ASK-4.a / 5,
  AUTONOMY-5/6 (pending asks), DISCORD-17 (`discord-send-file`), the
  REQ-discord-097 channel-post half and the REQ-discord-741 schedule rules.
- Added: REQ-discord-099 (the gate, every surface, the stamp). Modified:
  REQ-discord-097 (the replies half is no longer "a later change"),
  REQ-discord-741 (a schedule's result and question in a public thread wait
  like any reply).
- No new env var, config key, slash command, table or schema version; the
  `CORVIDINHO_DISCORD_REPLY_PUBLIC_THREAD` stamp is bridge-to-run plumbing.
