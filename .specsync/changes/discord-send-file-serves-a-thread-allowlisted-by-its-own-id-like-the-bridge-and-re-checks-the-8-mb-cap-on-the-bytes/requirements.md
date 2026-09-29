---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: requirements
---

# Requirements

Captured HI, no new criteria: **DISCORD-17** (`hi/discord.md`) — the agent
can attach files and images to its replies in the conversation's channel and
never says it can't; that must hold in every conversation the bridge serves,
including a thread allowlisted by its own id. **DISCORD-5** — the bridge's
channel gate applies first, deny wins (REQ-plugins-005).

Canonical requirement (see `deltas/discord.md`): **REQ-discord-476**
(Modified, full text) — the conversation's channel passes the gate the bridge serves it by
(`isMonitoredConversation` on the bridge's channel set: the thread itself or
its parent allowlisted, a deny on either wins); the file is read once from
one descriptor (no link followed at the checked path, the opened file's own
path re-checked for SAFE-2); the 8 MB cap holds for the bytes read as well as
the size first taken, reading at most the cap + 1 byte; the ask-button run
carries the thread and its parent.
