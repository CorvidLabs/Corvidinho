---
change: scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners
artifact: context
---

# Context

An end-to-end check of `origin/main` (3cdbb5c) found that `/session list`
run by any allowlisted non-owner returned every user's sessions: session ids,
other users' `<@mention>`s, topics (for `/work`, the first 120 chars of the
task description) and the absolute host project path. The cause is
`handleSessionList` in `src/discord/command-handlers/session.ts`, which
formatted `ctx.store.list()` unfiltered and printed `session.project`,
which the store resolves to an absolute directory.

This contradicts SESSION-MULTI-1 (each user has their own session, no shared
history across people) and the two-tier ROLES-CHAT model (non-owners are
read/chat only; only the owner is ADMIN, IDENTITY-2; empty owner means
nobody is ADMIN, IDENTITY-3).

Other listing surfaces checked: `/status` prints counts only (no ids,
mentions, topics or paths); `/agents` is static; `/work` has no list
subcommand. `/schedule list` (open to members by DISCORD-SCHEDULE-2) printed
the schedule's `project` verbatim, which can be an absolute host path.
