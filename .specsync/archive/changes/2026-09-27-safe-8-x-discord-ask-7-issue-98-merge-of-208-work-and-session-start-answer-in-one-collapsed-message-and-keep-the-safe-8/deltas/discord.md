---
module: discord
change: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
---

# Delta — discord (slash one-message answer keeps the SAFE-8 owner notice a fresh post, issue #98 x #208)

## Modified

### REQUIREMENT REQ-discord-098

The shared SQLite store SHALL treat the module-owned `spend_ledger` and
`spend_alerts` tables (created by `src/agent/spend.ts` and
`src/agent/spend-alerts.ts` with CREATE TABLE IF NOT EXISTS, no schema
version bump) like every other persisted table under SAFE-6: the free-text
`provider` and `model` columns of `spend_ledger` SHALL be written through
`scrubSecrets` and SHALL be listed in `SCRUB_TARGETS`, so a scrub-rules
re-scrub also covers them; `spend_alerts` SHALL hold no free text.

On Discord (SAFE-8 as amended on #98, AUTONOMOUS-8), a run that stopped at
the spend cap (`ask.reason` `spend-cap`) SHALL be posted through the
AUTONOMY-1/2 ask path on every bridge surface — chat reply, `/work`,
`/session start` and schedule post — with a paused, not failed, status and
without the "reply to answer" hint (a reply cannot lift the cap). Like a
stuck ask (AUTONOMY-2/4), a spend-cap ask SHALL ping the configured owner,
once per cap episode across those surfaces (the bridge's spend alert outbox
`claimCapPing`; a schedule also keeps its per-schedule ping key); later
spend-cap asks in the same episode SHALL post without a ping. A spend-cap
stop SHALL NOT be kept as the session's pending ask (AUTONOMY-5/6; a reply
cannot lift the cap): a later thin reply runs the agent like any other
message, a substantive reply carries no cap text into the prompt, and a
spend-cap pending ask persisted by an earlier build SHALL load as none;
clarify and stuck pending asks are unchanged. `/work` SHALL record a run
that stopped to ask as `blocked` (not `completed`; a stuck run stays
`failed`), SHALL say the PR was not opened because the run paused at the
spend cap, and `/status` SHALL count blocked work as waiting for input.
`/work` and `/session start` SHALL answer with the ask content in the one
message DISCORD-ASK-7 leaves (the thinking message edited into the answer
and the deferred reply deleted, else the status plus the reply), SHALL
address the requester on a clarify ask (AUTONOMY-4) and ping the owner only
for stuck and spend-cap asks; a run that stopped to ask SHALL never show "✅
Done" (the fallback status is the ask's). That owner ping and the warning
SHALL go out as a fresh channel post after the answer (allowed mentions
limited to the owner; an edit does not notify a mention), or be appended to
the answer that went out (the collapsed message edited again, or the reply)
when that post cannot be sent; when the answer itself fails (e.g. an
interaction token that expired during a long run) the notice SHALL still go
out as the fresh channel post and the answer's error SHALL still be raised.

The 80% warning SHALL reach the owner even when the run that crossed it had
no Discord reply (WATCH, the headless daemon, a delegate worker, a schedule
whose channel left the allowlist): every bridge post SHALL take the pending
warning from the outbox over the bridge's shared DB (the run's own
`spendWarning`, validated by `spendWarningFromUnknown`, only when the bridge
has no DB) and append the warning line built from integer amounts, pinging
the configured owner; a post that did not go out (a chat reply, a schedule
post, or a slash run's owner notice that went out neither as a channel post
nor in the reply) SHALL hand back both the warning and the cap episode's
owner ping for the next post, and a schedule SHALL keep no ping key for a
ping that was never posted. `/status` SHALL show the rolling 24-hour spend
against the cap with the percent, or that no cap is set, from the bridge's
shared DB, with no new slash command.

Acceptance Criteria
- A ledger row written with a vendor-key-looking provider or model persists redacted.
- `SCRUB_TARGETS` contains `spend_ledger` with `provider` and `model`.
- `rescrubDatabase` re-scrubs a raw `spend_ledger` row.
- A `spend-cap` ask reply carries the spend-cap headline and the question, pings the owner, its thinking status is not an error, and it never carries the reply hint.
- Two spend-cap asks with different amounts share one `askPingKey`.
- Two chat messages at the cap: the first reply pings the owner, the second posts the ask with no mention; after spend is seen under 70% the next one pings again. A spend-cap stop leaves no pending ask: a later `ok` runs the agent (still at the cap: the ask again, no mention) and a substantive reply's prompt carries no prior-question or cap text; a stored spend-cap pending ask loads as none while a stored clarify ask loads unchanged.
- `/work` with a clarify ask is `blocked`, mentions the requester in the reply and posts no owner notice.
- `/work` at the cap: the task is `blocked`, the reply shows the ask and the spend-cap PR line (no ✅), and one fresh post pings the owner; a second `/work` in the same episode does not ping. `/session start` at the cap shows the ask and pings the owner.
- A schedule spend-cap ask in an episode already pinged elsewhere posts without a mention.
- A warning recorded by another process (a WATCH-style run on the same data dir) appears on the next bridge chat reply with the owner pinged, once; `/work` delivers a pending warning as a fresh post pinging the owner.
- A result with `spendWarning` and no bridge DB gets the warning line and the owner in `mentionUserIds` (chat reply and schedule post); a malformed `spendWarning` in the result frame is dropped.
- `/status` with a $5 cap and $4.10 spent shows `Spend (24h): $4.10 of $5.00 daily cap (82%)`.
- `/work` whose final reply throws (expired interaction token) still posts the owner notice with the spend-cap ping and the pending warning, and the error is raised; `/session start` whose reply and notice both fail leaves the warning and the cap ping for the next chat reply, which pings the owner and carries the warning.
- A chat spend-cap reply that failed to post leaves the episode's owner ping for the next reply.
- A schedule spend-cap post that failed sets no ping key, and the next tick's post pings the owner.
- `/work` at the cap with an editable thinking message: the thinking message becomes the answer (`(blocked)`, the spend-cap ask, no ✅, no mention), the deferred reply is deleted, and one fresh post pings the owner with the pending warning; a second `/work` in the episode posts no owner notice.
- `/session start` with a stuck ask collapses to the ask (no ✅) and the owner gets a fresh post; with a clarify ask the collapsed answer mentions only the requester and no owner post goes out.
- The fresh owner post fails: the notice is appended to the collapsed answer (same message edited again, owner in its allowed mentions).
- Collapse, reply and owner post all fail (reply throws): the error is raised and the next chat answer carries the owner ping and the warning.
