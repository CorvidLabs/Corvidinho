---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: context
---

# Context

HI (captured, `hi/safe.md`): **SAFE-6** — "Secrets that look like vendor
keys are scrubbed before sessions are saved, and I can re-scrub history when
rules tighten." Requirement: REQ-discord-066 ("Sessions, work tasks,
schedules, schedule runs and memories persist scrubbed"; "Rows written before
the current rules are re-scrubbed on next open; second open is a no-op").

Gap on main (606b993): a session's open asks are saved raw.
`discord_sessions.pending_ask` holds the model-written ask question and
option labels as JSON (one object, or an array when several asks are open
since #254). `pendingAskBody` / `serializePendingAsks` in
`src/discord/session-store.ts` copied them unscrubbed, while
`persistSession` scrubbed only `topic`; `SCRUB_TARGETS` listed only
`discord_sessions.topic`, so `rescrubDatabase` never rewrote the column.
Repro on main: `setPendingAsk` with question `use ghp_<36>?` and option
label `yes ghp_<36>` stored both tokens verbatim, and `rescrubDatabase`
returned `discord_sessions: 0` with the token still present. Schedule asks
(`schedule_runs.ask_question`) and session turns were already scrubbed and
re-scrubbed, so `pending_ask` was the one session column left raw.

Constraints: no SQLite schema bump; no new CLI, slash command, env var or
config key; open buttons must keep working (askId, option ids, expiresAt and
stubMessageId byte-identical, which holds because no id an ask carries looks
like a secret once a secret-looking option id falls back to its position);
the re-scrub must not run a text scrub over
the JSON column (a private-key block with no END line runs to the end of the
text and would cut the closing quote and brace). Open PR #232 (ask-button
actor gate + mute/rate) and #233 (SAFE-3 clamp, busy-lock test timeouts) do
not touch `session-store.ts` or `scrub.ts`.
