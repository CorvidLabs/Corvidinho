---
module: discord
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
---

# Delta: discord (the bridge DMs the owner each stuck WATCH ask — AGENT-16.a)

## Added

### REQUIREMENT REQ-discord-086

When a GitHub run is stuck and needs me, it pings me on Discord like other
stuck asks (AGENT-16.a, captured with `hi` in this change from Leif's
2026-09-30 decision, interview round 13). With a DB the bridge SHALL build
`createWatchAskDelivery` (`src/discord/watch-ask.ts`) and run one
`deliver()` pass on every scheduler tick (`onTick`, alongside the forget
cards; one pass at a time, never rejecting) over the asks the watch process
recorded (REQ-watch-086). An ask older than `WATCH_OWNER_ASK_TTL_MS` (a day)
SHALL be taken and given up with a log line, never sent. With the gateway's
`sendDm` and an owner Discord id, each other ask SHALL be taken
(compare-and-delete, so two bridges never both send it) and sent to the owner
only, by direct message, as `formatWatchStuckAskDm`: the `formatAskReply`
stuck post (`⚠️ I'm stuck and need a human.`, the question quoted, SAFE-6
scrubbed and mass mentions defanged) with no mention (the DM notifies), led by
`GitHub <owner/repo>#<n> — answer on the thread: <link>`; never posted to a
channel. A DM that does not go out SHALL hand the ask back (a newer one
recorded meanwhile wins) and wait `WATCH_ASK_RETRY_MS` (10 minutes) before
the next try; with no owner or no `sendDm` the ask waits. Once the scheduler
starts with a live `sendDm`, the bridge SHALL record itself with
`markBridgeRunning` (its `<pid>:<proc start>` id in `schema_meta`). Its
`stop()` SHALL first stop the delivery (no further ask taken) and clear its
own mark, then wait at most `ABANDONED_SETTLE_MS` for a DM in flight —
handing that ask back after the grace so the next start sends it, and taking
it again if the DM then went out. The `watch_owner_asks.question` column SHALL
be a SAFE-6 re-scrub target (`SCRUB_TARGETS`; a new table, so no rules
version bump). No env var, config key, slash command or schema version is
added.

Acceptance Criteria
- `formatWatchStuckAskDm` is exactly the GitHub line, `⚠️ I'm stuck and need a human.` and the quoted question, with no `<@` mention.
- A failed DM hands the ask back and is not retried before `WATCH_ASK_RETRY_MS`; the next try DMs the owner's id with the question, takes the ask, logs `owner DMed`, and a later pass sends nothing.
- With no owner or no `sendDm` the ask stays pending; past a day it is given up (`expired`) with a log line and never sent.
- A stop while the DM hangs: `settle` returns false after the grace and the ask is pending again.
- A dry-run bridge whose gateway stub captures `sendDm` marks itself running, DMs the owner once for a recorded assignment ask within a few ticks (not again on later ticks), takes it, and clears its mark on stop.
