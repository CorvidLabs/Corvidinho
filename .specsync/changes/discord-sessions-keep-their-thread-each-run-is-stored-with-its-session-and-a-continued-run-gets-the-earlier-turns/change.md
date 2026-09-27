---
id: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
state: verifying
type: feature
base_commit: fc0ed8da6e47dc1db452ee51044cde096db4e8bc
---

# Discord sessions keep their thread: each run is stored with its session and a continued run gets the earlier turns replayed, bounded (AGENT-6)

## Intent

Discord sessions keep their thread: each run is stored with its session and a continued run gets the earlier turns replayed, bounded (AGENT-6)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A reply, thread message, same-channel @mention or button pick that continues a live Discord session runs the agent with that session's earlier turns (the human's own words and the answer as posted, from @mention, reply, button pick, /session start and /work) replayed oldest first in a labelled block ahead of the new message, within a fixed character budget that keeps the opening request and the newest turns and replaces middle turns with an omitted-count marker; the thread survives a bridge restart within the soft TTL; a session idle past the TTL or ended starts fresh with no replay and its turns are deleted; another user's session never sees them; humanText (SAFE-4 confirm tokens) stays the current message only; a spend-cap stop records no cap text; stored turns are scrubbed on write and covered by the SAFE-6 re-scrub; no schema version bump, env var, flag or slash command; tests/discord.session-thread.test.ts and tests/discord.session-thread.unit.test.ts cover these and the new-behaviour tests fail on origin/main

## No-spec Rationale

Not applicable
