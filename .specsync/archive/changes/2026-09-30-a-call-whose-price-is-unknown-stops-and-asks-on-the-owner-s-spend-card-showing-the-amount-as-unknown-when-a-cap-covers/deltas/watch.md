---
module: watch
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
---

# Delta: watch (a WATCH run stopped at a spend cap is handed to the bridge for the owner's DM, AUTONOMY-8)

## Added

### REQUIREMENT REQ-watch-099

It asks before any spend that would go over a cap (AUTONOMY-8), on GitHub
too. A WATCH run that ends stopped at a spend cap — a `spend-cap` ask: no
owner to raise a spend card, a spend card that came to no (denied, or lapsed
because no bridge was running), an unpriced call whose card came to no, an
invalid cap setting or an unreadable ledger — SHALL be handed to the bridge
like a stuck ask (REQ-watch-086): `noteWatchRunAsk` SHALL record it in
`watch_owner_asks` (`WATCH_OWNER_ASK_REASONS`: `stuck` and `spend-cap`; one
row per thread, a newer ask replacing it, the question SAFE-6 scrubbed) when
an owner Discord id is configured and the poller has its DB, so the bridge
DMs the owner the stop's details (REQ-discord-199). Its log lines SHALL say
`spend-cap stop`, the owner's Discord DM and `AUTONOMY-8`, SHALL say that
GitHub shows only that work is paused for budget (SAFE-14.a) when the run
summary comment was posted, else that no comment on GitHub carries it, and
SHALL name no amount; the no-owner, no-DB and no-bridge variants are as for
stuck asks.
The run summary comment on GitHub stays the generic "Work is paused for
budget." (no amounts, caps, scopes or setting names). A later run on the
thread that is not stopped drops it.

Acceptance Criteria
- With a live bridge mark, an issue comment whose run ends with a spend-cap stop records one `spend-cap` row whose question keeps `Stopped at cap: total.`; the log line is `[watch] spend-cap stop CorvidLabs/Corvidinho#7 id=comment-1: queued for the owner's Discord DM (AUTONOMY-8)` with no `$` amount; the summary comment carries "Work is paused for budget." and no comment names an amount, `CORVIDINHO_DAILY` or the cap marker.
- No owner: `not-sent` / `no-owner`; no bridge: `no-bridge`, the log saying GitHub shows only that work is paused for budget, with no amount; a later run with no ask drops the row.
- An event with no summary comment (summary not posted): the no-bridge log says no comment on GitHub carries it and never that GitHub shows the pause, with no amount.
- These tests fail on main's sources (the stop is never recorded).

## Modified

### REQUIREMENT REQ-watch-086

When a GitHub run is stuck and needs me, it pings me on Discord like other
stuck asks (AGENT-16.a, captured with `hi` in this change from Leif's
2026-09-30 decision, interview round 13). The WATCH spawn client SHALL return
the result frame's `ask` as `AgentSpawnResult.ask`, validated and
re-normalized with `askFromUnknown`. After every run the poller starts, on
every event type (`issue_comment`, `issues`,
`pull_request_review_comment`, `assignment`, `review_request`: ackable
or not, summary comment posted or not), it SHALL call `noteWatchRunAsk`
(`src/watch/owner-ask.ts`, never throwing). A `stuck` ask (a repeated
failing call, REQ-agent-086, or verification failing after every retry,
AUTONOMY-2) SHALL be recorded, when an owner Discord id is configured and the
poller has its DB, in the module-owned `watch_owner_asks` table (created on
first use, no schema version bump): one row per issue or PR thread (id
`issue:<owner/repo>#<n>`, a newer ask replacing it) holding the repo, number,
event id and type, a GitHub link (the event's `htmlUrl` when it is a
`https://github.com/` URL, else `threadUrl`), the reason and the SAFE-6
scrubbed question (a `SCRUB_TARGETS` column). One log line SHALL then say
it is queued for the owner's Discord ping when a bridge marked itself running
on this data dir and its process is alive (`bridgeRunning`,
`schema_meta` `discord_bridge_runner`, the schedule runner liveness
check), else that the owner's Discord ping could not be sent because no
Discord bridge is running on this data dir, that it is sent if one starts
within a day, and whether the run summary comment carries the question. With
no owner Discord id or no DB nothing SHALL be recorded and one log line SHALL
say the ping could not be sent and why. A `spend-cap` stop SHALL be handed
over the same way (REQ-watch-099). Any other outcome on the thread (no ask,
a `clarify` ask) SHALL drop the thread's pending ask.
Nothing new SHALL be posted on GitHub; the run summary comment is unchanged
and carries `Needs your input: …` where WATCH posts one. The Discord side is
REQ-discord-086.

Acceptance Criteria
- An assignment whose run ends with a stuck ask posts nothing on GitHub, records one `watch_owner_asks` row (thread id, repo, number, event id and type, link, ask) and, with no bridge mark, logs `[watch] stuck ask <repo>#<n> id=<id>: the owner's Discord ping could not be sent — no Discord bridge is running on this data dir (CORVIDINHO_DATA_DIR); it is sent if one starts within a day; no comment on GitHub carries the question (AGENT-16.a)`.
- With a live bridge mark, an issue comment's stuck ask is recorded, the log says it is queued, and the run summary comment carries `Needs your input: <question>`.
- A review request's verify-exhausted stuck ask is recorded with the thread's own URL when the event has no GitHub link.
- A later run on the thread with no ask drops the pending row; a clarify ask never records one.
- No owner Discord id: nothing recorded, one log line naming IDENTITY-3; no DB: one log line, no throw.
- `bridgeRunning` is true only while the marked process runs (a dead pid's mark does not count); `clearBridgeRunning` removes only its own mark.
- The stored question is scrubbed on write, `watch_owner_asks.question` is in `SCRUB_TARGETS` and `rescrubDatabase` re-scrubs it; an ask other than stuck or spend-cap (REQ-watch-099) is never stored.
- The spawn client returns a blocked result frame's stuck ask as `ask`.
