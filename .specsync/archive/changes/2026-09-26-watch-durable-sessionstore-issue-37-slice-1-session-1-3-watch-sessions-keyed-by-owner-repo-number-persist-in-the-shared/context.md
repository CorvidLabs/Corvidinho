---
change: watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared
artifact: context
---

# Context

Issue #37 (SESSION continuity, M2 Talk anywhere). #61 made the Discord
SessionStore durable (SQLite `discord_sessions`, soft TTL from
`resolveSessionTtlMs`, SESSION-1..4) but explicitly left the WATCH
SessionStore in memory: a `github watch` restart forgot which
`owner/repo#number` had a live session, and WATCH sessions never expired, so an
issue pinged hours later "continued" a stale session (against SESSION-1..3).
Leif's planning comment on #37 (2026-09-26) lists "WATCH still keeps its
session map in memory" as the remaining continuity gap.

This change is slice (1) only: durable WATCH sessions with the same soft TTL.
Not built here (follow-ups): turn persistence/replay (resume-by-id relates to
retired CLI-6; no captured HI), stored conversation summaries (draft, see #72
SESSION-5/6), durable processed-id/ack dedup for WATCH, and "clear new topic"
detection. Cross-session continuity still comes from MEMORY (SESSION-4).
