---
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
artifact: context
---

# Context

Issue #122 (M2 "Talk anywhere"). Leif's live failure on Discord: "show me a
gif of a dog" → `session sess_be8e982b6df84eb4 failed (exit 1)` with the
footer `gpt-4o-mini | tokens unknown | cost unknown | 1s | state=failed
verified=false attempts=1` and no reason anywhere. In round 15 of his
interview (2026-09-30, record `/home/user/coord/interview-2026-09-28.md`) he
chose: the owner sees one short plain scrubbed reason; others get "That didn't
work — the owner has been told."; the reason is always logged at the bridge.
This PR captures that as DISCORD-3.b with `hi` (its own commit) and builds it.

What was wrong on main (9ea4005):

- `src/discord/bridge.ts` (chat and the ask-pick / Answer resume),
  `src/discord/command-handlers/session.ts`, `work.ts` and
  `src/scheduler/service.ts` posted `session <id> failed (exit N)` /
  `failed (exit N)` and dropped the reason; a run that threw posted its raw
  error message (host paths included) to everyone.
- `task run` in the machine modes keeps stderr quiet and the failed
  result's summary is the provider's error text (`LLM HTTP 401: <body>`),
  which is provider output, not harness text; `collectTaskRunStream` read
  the child's stderr but nobody logged or showed it.

Constraints: specs only through SpecSync; no protocol bump (the result frame
gains an optional `error`); no env var, config key, slash command or schema
change; v1 is off-chain; #232/#233 and the parallel stop-button-2,
cli-worktree and spend-caps-c slices are untouched (the bridge edits are the
failure-body lines, the throw lines and the helper wiring only).
