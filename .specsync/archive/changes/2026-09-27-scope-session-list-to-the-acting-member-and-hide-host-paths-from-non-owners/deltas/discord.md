---
module: discord
change: scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners
---

# Delta — discord (/session list is per-user for non-owners; no host paths)

## Added

### REQUIREMENT REQ-discord-418

Slash list surfaces SHALL NOT show one user's sessions to another, and SHALL
NOT show an absolute host path to anyone but ADMIN (SESSION-MULTI-1,
ROLES-CHAT-1..4, IDENTITY-2/3). ADMIN is resolved at handler time with
`resolvePermissionLevel` (the configured owner; empty owner means nobody).

- `/session list` by ADMIN SHALL list every active session as before,
  including each session's full project path.
- `/session list` by anyone else SHALL list only sessions whose owner user id
  equals the acting user id. Another user's session id, mention and topic
  SHALL NOT appear. The project SHALL be shown as its name (the last segment
  of an absolute path; a relative name as given), never as an absolute host
  path. A member with no own sessions SHALL get "No active sessions.".
- `/schedule list` by anyone but ADMIN SHALL show each schedule's project as
  its name, never an absolute host path; ADMIN sees the stored project.
- `/status` SHALL stay counts-only (no session ids, mentions, topics or
  paths).

No new slash command, option, env var, table or column. The session store and
its `list()` are unchanged.

Acceptance Criteria
- A member's `/session list` shows only their own sessions and none of another user's id, mention or topic.
- A member's `/session list` never contains an absolute host path; the project name is shown instead.
- A member with no own sessions gets "No active sessions." even when other users have sessions.
- The owner's `/session list` shows every user's sessions with full project paths.
- With no owner configured, nobody is ADMIN and every user sees only their own sessions.
- A member's `/status` has counts only, with no session id, mention, topic or project path.
- A member's `/schedule list` shows the project name, not the absolute path; the owner's shows the full path.
- Regression tests in `tests/discord.session-list-scope.test.ts` fail on `main` and pass after the fix.
