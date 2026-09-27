---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: requirements
---

# Requirements

Captured HI: **AGENT-6** (`hi/agent.md`): "I can leave a session and come
back to it later without losing the thread." Bounded by DISCORD-2 /
DISCORD-2.a (`hi/discord.md`, the conversation stays coherent), SESSION-1..4
and SESSION-MULTI-1 (`hi/session.md`), SAFE-4 and SAFE-6 (`hi/safe.md`).
Issue #72.

Added `REQ-discord-072` (delta `deltas/discord.md`): each Discord agent run
is recorded with its session (human words + posted answer), and a continued
run (reply, thread message, same-channel @mention, button pick) gets the
earlier turns replayed oldest first in a labelled block within a fixed
budget (opening request and newest turns kept, middle elided with a count
marker). Turns persist in the module-owned `discord_session_turns` table
(no schema version bump), are scrubbed (SAFE-6), die with their session
(SESSION-3), never cross users (SESSION-MULTI-1), and never feed SAFE-4
confirm tokens. REQ-discord-019 (durable sessions, soft TTL) and
REQ-discord-098 (a spend-cap stop carries no cap text into the prompt) are
unchanged and still hold.

Not in this change: the condensation drafted in issue #72 (summarise at
about 80% of the window, pin the task word for word, save the summary with
the session) is draft SESSION-5/6, not captured in `hi/session.md`, so it is
not built. CLI-6 (`task run` resume by id) is a separate id.
