---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: context
---

# Context

W12 bug sweep, four overlapping records (`watch-summary-drops-role-note`,
`scheduler-summary-cut-drops-role-note`, `slash-summary-cut-drops-role-note`,
`role-note-cut-by-1500-slice`). Leif's 2026-09-28 interview settled the
design: use `clipKeepingRoleNote` at each cap, one test per surface, kind
bug-fix. No new hi criteria.

ROLES-CHAT-3 says a refused tool call is silent to the channel except a short
in-session "not allowed for your role" in the agent summary. REQ-agent-333
makes a run's summary end with `\n\n(not allowed for your role)` and keeps it
through the result-frame (4000) and chat-body (1800) caps. Later caps dropped
it with plain head cuts:

- `src/watch/summary.ts` `buildSummaryBody`: `scrubSecrets(...).trim().slice(0, 1200)`
  (WATCH runs are non-ADMIN, so the note happens there).
- `src/scheduler/service.ts`: `result.summary.slice(0, 1500)` for the run row
  and again in the schedule post (scheduled runs are always `actingIsAdmin: false`).
- `src/discord/command-handlers/work.ts` / `session.ts`:
  `result.summary.slice(0, 1500)`; `/work` also puts up to ~500 chars of head
  before it, so the gateway's 1900 cut could land on the note too.
- `src/discord/ask-ping.ts` `appendPostLine`: cuts the body's tail so the
  SAFE-8 80% warning line fits in 1900 (chat path via `withSpendWarningPost`,
  schedule posts, slash owner notice riding the answer).

Reproduced on `origin/main` 0f2e2c2 with the five new tests (all fail).

Ruled out / left alone: the bridge's `result.summary.slice(0, 1800)` (the
summary is already at most 1800 from `chatBodyFromTaskResult`, a no-op); the
stuck-ask context clip in `formatAskReply` (`ASK_REPLY_CONTEXT_MAX`, 400) and
the `/work` task-store summary (`slice(0, 500)`, never posted) — not among the
surfaces the interview named; #232/#233 scope untouched.
