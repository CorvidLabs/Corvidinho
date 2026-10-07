---
id: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
state: verifying
type: feature
base_commit: 6526a95b9f0be002f310767668a37f072e625bf6
---

# With only the daemon running and no bridge, a scheduled run's question still reaches me by DM (AUTONOMOUS-7.a)

## Intent

With only the daemon running and no bridge, a scheduled run's question still reaches me by DM (AUTONOMOUS-7.a)

## Affected Canonical Specs

- `discord`
- `cli`

## Acceptance Criteria

- AUTONOMOUS-7.a (hi/autonomous.md, captured in this PR from Leif's 2026-09-28 interview, round 17): with only corvidinho daemon running and no Discord bridge on its CORVIDINHO_DATA_DIR (bridgeRunning, the schema_meta mark a bridge with a scheduler writes, its process alive), each pending schedule ask (pendingAsks: the newest finished run's, open, not taken) whose creator and channel pass the live DISCORD-SCHEDULE-3 gate is taken with claimRunAsk (ask_posted_at, the delivered marker; no schema change) and DMed to the owner as configured now over Discord's REST API with the bot token (createRestSendDm: POST /users/@me/channels then /channels/<id>/messages, allowed_mentions parse [], defanged, refused over DISCORD_DM_MAX, no components) right after the run and on later ticks: the schedule ask post with no mention (scrubbed, defanged, quoted question) or a spend-cap stop's details once per cap episode (headline only when the episode was told), then formatScheduleAskDaemonNote (no controls; the schedule's wait note brings them once a bridge runs; its next runs wait, AUTONOMY-6.a). A bridge started later never sends it again and posts only the wait note with controls. While a bridge runs nothing is DMed; no token or no owner: nothing is taken, schedule_ask.dm_unavailable is logged once, the ask waits; a DM that does not go out is handed back and retried after 10 min; a stop that outlasts a DM in flight hands it back. Tests in tests/daemon.owner-dm.test.ts (fake DM sender and fake Discord REST client) and tests/discord.rest-dm.test.ts fail on main and pass on the branch.

## No-spec Rationale

Not applicable
