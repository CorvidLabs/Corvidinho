---
change: soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity
artifact: testing
---

# Testing

tests/discord.session-worktree.test.ts, describe "soft-TTL purge never parks a
busy session (REQ-discord-204)": each case uses a temp git repo, a temp
`WORKTREE_BASE_DIR` and an injected clock. The agent writes `half-done.ts`
into its cwd, moves the clock by TTL + 1 minute, then calls `store.list()`
(what /status and /session list do) and `store.get()`.

Before the fix: 4 fail (worktree and edit gone mid-run; /work reply lost the
Worktree line; bridge threw SQLite FOREIGN KEY when tracking the bot reply;
`runActive` missing). After the fix: 9/9 pass in the file.

Plus `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`
and `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | Test | Evidence |
| --- | --- | --- |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › /work: a lookup past the TTL mid-run keeps the worktree and the agent's edits | worktree and half-done.ts survive a mid-run `list()`; reply keeps `Worktree:`; session touched at run end |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › /session start: a lookup past the TTL mid-run keeps the worktree | worktree and edit survive; reply keeps `Worktree:` |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › bridge mention: a lookup past the TTL mid-run keeps the worktree | worktree and edit survive; reply-to-bot still maps to the live session (no FOREIGN KEY error) |
| REQ-discord-204 | tests/discord.session-worktree.test.ts › once the run ends, an idle session past the TTL is still purged and parked | busy session kept past the TTL; idle past the TTL after the run → purged and worktree removed |
