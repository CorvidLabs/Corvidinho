---
module: discord
change: safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run
---

# Delta — discord (spend-cap ask, 80% warning line, /status spend, issue #98)

## Modified

### REQUIREMENT REQ-discord-098

The shared SQLite store SHALL treat the module-owned `spend_ledger` and
`spend_alerts` tables (created by `src/agent/spend.ts` with CREATE TABLE IF
NOT EXISTS, no schema version bump) like every other persisted table under
SAFE-6: the free-text `provider` and `model` columns of `spend_ledger` SHALL
be written through `scrubSecrets` and SHALL be listed in `SCRUB_TARGETS`, so a
scrub-rules re-scrub also covers them; `spend_alerts` SHALL hold no free text.

On Discord (SAFE-8 as amended on #98, AUTONOMOUS-8), a run that stopped at
the spend cap (`ask.reason` `spend-cap`) SHALL be posted through the
AUTONOMY-1/2 ask path: the question goes to the requester (chat) or the
schedule channel with the configured owner pinged and a paused, not failed,
thinking status, and a schedule SHALL ping the owner once per cap episode
(the ping key ignores the live amounts; a clean run re-arms it). When a run's
result carries `spendWarning`, the spawn client SHALL accept only valid
integer amounts (percent recomputed), and the chat reply and the schedule
post SHALL append the 80% warning line built from those amounts, pinging the
configured owner (allowed mentions limited to the owner plus any the post
already allowed). `/status` SHALL show the rolling 24-hour spend against the
cap with the percent, or that no cap is set, from the bridge's shared DB,
with no new slash command.

Acceptance Criteria
- A ledger row written with a vendor-key-looking provider or model persists redacted.
- `SCRUB_TARGETS` contains `spend_ledger` with `provider` and `model`.
- `rescrubDatabase` re-scrubs a raw `spend_ledger` row.
- A `spend-cap` ask reply carries the spend-cap headline and the question, pings the owner, and its thinking status is not an error.
- Two spend-cap asks with different amounts share one `askPingKey`.
- A result with `spendWarning` gets the warning line and the owner in `mentionUserIds` (chat reply and schedule post); a malformed `spendWarning` in the result frame is dropped.
- `/status` with a $5 cap and $4.10 spent shows `Spend (24h): $4.10 of $5.00 daily cap (82%)`.
