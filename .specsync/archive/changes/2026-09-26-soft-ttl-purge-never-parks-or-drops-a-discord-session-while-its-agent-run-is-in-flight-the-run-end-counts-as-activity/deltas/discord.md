---
module: discord
change: soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity
---

# Delta — discord (soft-TTL purge never parks a busy session)

## Added

### REQUIREMENT REQ-discord-204

While an agent run is in flight for a Discord session (bridge
mention/reply/thread chat, `/work`, `/session start`), the session SHALL
count as busy: the soft-TTL purge on `get`, `getByThread`,
`getByBotMessage` and `list` SHALL NOT drop that session or park/remove its
worktree, however long the run takes (SESSION-WORKTREE-3: only an ended or
abandoned talk is parked). The end of a run SHALL count as activity and
refresh `lastActivityAt` (SESSION-2). Once no run is in flight, a session
idle past the TTL SHALL still be purged and its worktree parked as before
(REQ-discord-019 / REQ-discord-022).

Acceptance Criteria
- A lookup past the TTL during a run keeps the session, its worktree, and the agent's uncommitted edits.
- `/work` and `/session start` replies keep the Worktree line after a run longer than the TTL.
- The bridge can track the bot reply for a run longer than the TTL (no dropped session row).
- After a run, an idle session past the TTL is purged and its worktree parked.
- No new env vars, slash commands, or schema changes.
