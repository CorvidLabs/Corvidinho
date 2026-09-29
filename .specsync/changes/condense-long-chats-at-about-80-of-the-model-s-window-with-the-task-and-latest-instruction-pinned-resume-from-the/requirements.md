---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: requirements
---

# Requirements

- Added **REQ-discord-472** (delta `deltas/discord.md`): condensing at about
  80% of the model's window with the task and latest instruction word for word
  (SESSION-5); the summary stored with the session and picked up after a
  restart or with another window (SESSION-6); each conversation kept 30 days
  per thread in `conversation_threads` (schema v12, scrubbed) and purged
  (AGENT-6.a); a reply to an expired session's answer or a message in its
  thread starts a new session from it after the channel, actor and mute gates
  (SESSION-3.a); `SessionStore.forgetConversations` /
  `forgetConversations(db, person)` for the forget-me flow (AGENT-6.a,
  MEMORY-ACL-6).
- Modified **REQ-discord-072**: the fixed 6000-char budget and "No model
  summarising" become the window-based condensed block (32000-char transport
  ceiling kept as a safety net), human turns clipped at 6000, past 200 turns
  folded not dropped, turn rows go with the session after the conversation is
  kept, the one optional env var; three acceptance bullets updated/added.
- Modified **REQ-discord-019**: an expired session is still never continued,
  but its user's reply or thread message starts a new session from the kept
  conversation; one bullet added.
- Added **REQ-watch-472** (delta `deltas/watch.md`): WATCH follow-ups pick up
  the issue or PR thread's conversation (AGENT-6.a), condensed at about 80%
  (SESSION-5), kept 30 days, deleted when a participant is forgotten.
- Modified **REQ-watch-037**: "turn persistence/replay and stored summaries
  are out of scope" replaced by the pointer to REQ-watch-472; one bullet.
- HI: SESSION-5, SESSION-6, SESSION-3.a, AGENT-6.a (with SESSION-1..4,
  SESSION-MULTI-1, MEMORY-1/3, SAFE-6, DISCORD-5/6, ALLOW-5 unchanged). No
  acceptance criteria beyond these captured ids.
