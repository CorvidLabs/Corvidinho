---
module: discord
change: autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44
---

# Delta: discord (questions and owner ping, AUTONOMY-1/2)

## Added

### REQUIREMENT REQ-discord-044

When a spawned run's `result` carries a valid `ask`, the HEAR mention/reply
path SHALL reply to the requester with the question instead of the summary or
a bare `failed (exit N)` line (AUTONOMY-1), and SHALL mention the configured
owner (IDENTITY-1) on the post's first line (AUTONOMY-2). The post SHALL limit
allowed mentions to the owner plus the replied-to author, SHALL scrub secrets
(SAFE-6) and defang `@everyone` / `@here` in the model's text, and SHALL end
with a hint that replying answers (DISCORD-2 continues the session). The
thinking status SHALL end as "Needs your input" (clarify) or failed "Stuck"
(stuck). With no owner configured the question SHALL still post with no
mention and the bridge SHALL log a warning (IDENTITY-3).

A scheduled tick whose run carries an ask SHALL post the question with the
schedule line as prefix and the same owner mention to the schedule's channel,
only when that channel passes the allowlist (DISCORD-SCHEDULE-3). Pings SHALL
go only where the bridge already posts: no DMs, no new channels, no new slash
commands.

A schedule SHALL ping the owner once per question: the scheduler SHALL
persist a digest of the pinged ask (reason plus SAFE-6 scrubbed question,
never the text) on the schedule row (schema v7 `schedules.ask_ping_key`), and
a later tick whose ask has the same digest SHALL still post the question but
SHALL NOT mention anyone (`mentionUserIds: []`). The marker SHALL be cleared
when a run succeeds without an ask or the schedule is paused or resumed, and a
different question or reason SHALL ping again. A failed run without an ask
SHALL keep the marker. With no owner configured no marker is recorded.

Acceptance Criteria
- Mention path: an ask reply quotes the question and carries `<@owner>` plus `mentionUserIds: [owner]`.
- A stuck ask on a failed run replaces `failed (exit N)` with the question and a failed thinking status.
- No owner: question posts, no mention, `mentionUserIds: []`.
- Runs without an ask keep the plain reply with no mention restriction.
- The spawn client passes a valid `result.ask` through and drops a malformed one.
- Scheduler ask posts carry the schedule prefix, the question, and the owner mention.
- The same schedule question pings once; repeat ticks post it with no mention.
- A changed question or reason pings again; a clean run or pause/resume re-arms the ping; a failed run keeps the marker.
- The marker persists in SQLite (schema v7) across a restart or a second ticker on one data dir.
