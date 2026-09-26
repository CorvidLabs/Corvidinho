---
module: discord
change: discord-outbound-posts-parse-no-mentions-from-model-text-discord-8
---

# Delta: discord (outbound posts parse no mentions from model text, DISCORD-8)

## Added

### REQUIREMENT REQ-discord-205

Every Discord post the bridge or its agent makes SHALL parse no mentions
from its content (DISCORD-8 confused deputy; ROLES-CHAT-3 / ROLES-CHAT-8:
text steered by a non-owner's prompt or by public GitHub content SHALL NOT
use the bot's own mention powers). The live gateway's discord.js `Client`
SHALL default `allowedMentions` to `{ parse: [], repliedUser: true }`, and
every outbound payload SHALL set `allowedMentions.parse = []` explicitly:
gateway `reply` (chat mention / reply-continue / thread replies, refusal and
worktree-failure replies, schedule tick and announce posts), thinking embed
sends and edits, and slash `reply` / `editReply` (including the
`/session start` and `/work` deferred public replies). So `@everyone`,
`@here`, `<@&role>` and `<@user>` in the text SHALL never ping. A reply
SHALL still ping the author it replies to. The only other pings SHALL be
users the caller names: the AUTONOMY-2 ask post keeps `users: [owner]`
(REQ-discord-044), and with no owner nobody. `@everyone` / `@here` SHALL
also be defanged (zero-width space) in all outbound text before the
1900-character cap. The agent's `discord-post-message` REST post SHALL send
`allowed_mentions: { parse: [] }` and the defanged text. No new slash
command, env var, config, table or column.

Acceptance Criteria
- A chat reply (mention and reply-continue) whose summary contains `@everyone`, `@here`, `<@&id>` and `<@id>` is sent with `allowedMentions.parse` empty, no `roles` / `users`, `repliedUser: true`, and no literal `@everyone` / `@here`.
- The `/session start` and `/work` deferred public replies (`editReply`) and ephemeral slash replies carry `allowedMentions.parse` empty and defanged text.
- The live client default, thinking embed sends and edits, and schedule tick posts carry `parse: []`.
- An ask post still allows exactly the owner (`users: [owner]`); with no owner, no user.
- `discord-post-message` sends `allowed_mentions: { parse: [] }` and defanged text.
- Fixture tests inject a fake discord.js into the real live gateway and stub fetch for the plugin; no live Discord or network.

## Modified

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

A `/work` run whose result frame reports state `blocked` SHALL NOT be shipped
as a pull request (REQ-discord-088): the PR step SHALL stop before any
repository, plugin or verify call and its `PR:` line SHALL say the run is
waiting for an answer (skip reason `needs-input`).

Acceptance Criteria
- Mention path: an ask reply quotes the question and carries `<@owner>` plus `mentionUserIds: [owner]`.
- A stuck ask on a failed run replaces `failed (exit N)` with the question and a failed thinking status.
- No owner: question posts, no mention, `mentionUserIds: []`.
- Runs without an ask keep the plain reply and allow no mention beyond the replied-to author (REQ-discord-205).
- The spawn client passes a valid `result.ask` through and drops a malformed one.
- Scheduler ask posts carry the schedule prefix, the question, and the owner mention.
- The same schedule question pings once; repeat ticks post it with no mention.
- A changed question or reason pings again; a clean run or pause/resume re-arms the ping; a failed run keeps the marker.
- The marker persists in SQLite (schema v7) across a restart or a second ticker on one data dir.
- A blocked `/work` run opens no PR, says it is waiting for an answer, and makes no repository, plugin or verify call.
