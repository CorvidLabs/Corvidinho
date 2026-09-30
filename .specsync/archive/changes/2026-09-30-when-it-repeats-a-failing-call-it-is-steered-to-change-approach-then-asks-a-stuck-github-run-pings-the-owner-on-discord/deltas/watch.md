---
module: watch
change: when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord
---

# Delta: watch (a stuck GitHub run is handed to the bridge so the owner is pinged on Discord — AGENT-16.a)

## Added

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
say the ping could not be sent and why. Any other outcome on the thread (no
ask, a `clarify` or `spend-cap` ask) SHALL drop the thread's pending ask.
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
- The stored question is scrubbed on write, `watch_owner_asks.question` is in `SCRUB_TARGETS` and `rescrubDatabase` re-scrubs it; a non-stuck ask is never stored.
- The spawn client returns a blocked result frame's stuck ask as `ask`.
