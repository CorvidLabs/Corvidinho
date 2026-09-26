---
change: soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity
artifact: context
---

# Context

Found in a Discord bug sweep (discord-4, severity high). `SessionStore`
drops a session whose `lastActivityAt` is older than the soft TTL (~45m) on
any lookup (`get`, `getByThread`, `getByBotMessage`, `list`) and
fire-and-forgets `parkSessionWorktree`, which runs
`git worktree remove --force` (or removes the scoped dir). Nothing touched
the session while `agent.runChat` ran, so a /work, /session start or chat run
longer than the TTL lost its live worktree as soon as anyone ran /status or
/session list, or sent a message that did a thread/reply lookup. The agent's
uncommitted edits were destroyed mid-run, /work still said "completed", and
the Worktree line vanished. On the bridge path the run then threw a SQLite
FOREIGN KEY error when it tracked the bot reply for the dropped session row.

Repro (fixture, real temp git repo, injected clock): the agent writes
`half-done.ts`, the clock moves 46 minutes, `store.list()` runs mid-run, and
the worktree and the file are gone.

HI: SESSION-2 (activity keeps the session), SESSION-WORKTREE-3 (park only an
ended or abandoned talk, never live work). No new env vars or slash commands.
