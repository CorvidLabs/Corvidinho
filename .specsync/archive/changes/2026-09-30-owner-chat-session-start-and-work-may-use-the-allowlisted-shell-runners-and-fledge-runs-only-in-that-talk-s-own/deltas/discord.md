---
module: discord
change: owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own
---

# Delta: discord (each spawn stamps the surface the shell gate reads, SAFE-3.a)

## Added

### REQUIREMENT REQ-discord-735

Surface stamp for the SAFE-3.a shell gate (REQ-agent-503). `AgentRunChatOpts`
SHALL gain `surface?: ActingSurface` (`src/agent/shell-gate.ts`), and the
Discord spawn client (`createSpawnAgentClient`) SHALL always write it to
`CORVIDINHO_ACTING_SURFACE`, empty when the caller names none, never passing
on a value from the bridge's own env. The bridge's chat message path SHALL
pass `chat`; its ask continuation (an ask-button pick or the private Answer
form resuming the same session in its own worktree, the presser being the
session's user) `ask`; `/session start` `session`; `/work` `work`; and the
scheduler's `runOne` `schedule`. Only `chat`, `ask`, `session` and `work`
can be granted the shell, runners and Fledge runs, and only for the owner in
the talk's own worktree; a schedule (also marked by its `schedule_` session
id) never is. Roles, the work flag, the reply channel and every other spawn
key are unchanged. No config key, flag, slash option, table or schema change.

Acceptance Criteria
- `tests/discord.safe3a-surface.test.ts`: the spawn client writes `chat`, `ask`, `session`, `work` and `schedule` as given and an empty stamp when none is named, even with `CORVIDINHO_ACTING_SURFACE=chat` in its own env.
- Same file: through the bridge, a chat message, an ask-button pick continuing it (same session id and cwd), `/session start` and `/work` pass `chat`, `ask`, `session` and `work`; a scheduler tick passes `schedule`.
- With the base's sources these tests fail; they pass on the branch.
