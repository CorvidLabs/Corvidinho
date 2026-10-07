---
module: discord
change: with-only-the-daemon-running-and-no-bridge-a-scheduled-run-s-question-still-reaches-me-by-dm-autonomous-7-a
---

# Delta — discord (with only the daemon running, a schedule's question reaches the owner by DM, AUTONOMOUS-7.a)

## Added

### REQUIREMENT REQ-discord-707

With only the daemon running and no bridge, a scheduled run's question SHALL
still reach the owner by DM (AUTONOMOUS-7.a, captured with `hi` in this
change from Leif's 2026-09-28 interview, round 17; under AUTONOMOUS-7).

- Owner DM pass. `SchedulerServiceOpts` SHALL take an optional `ownerDm:
  ScheduleOwnerDm` (`send?: SendPrivateDm`, `bridgeLive()`, `spendAlerts?`,
  `log?`, `retryMs?`). It SHALL be used only by a ticker that cannot post (no
  `outbound.post`): its delivery pass (one at a time, fire-and-forget on
  each tick, and started again right after a run of its own records an ask)
  SHALL then DM pending asks instead of posting them. For each ask
  `pendingAsks()` lists (the schedule's newest finished run's, open, not
  taken), oldest first, it SHALL: stop the pass when `bridgeLive()` is true
  (a throw counts as true), re-read before each ask; skip an ask whose
  schedule is gone or whose creator or channel the live DISCORD-SCHEDULE-3
  gate refuses (REQ-discord-020), leaving it pending; skip an ask whose last
  DM failed less than `retryMs` (default `OWNER_DM_RETRY_MS`, 10 minutes)
  ago; with no `send` (no bot token) or no owner Discord id (the owner as
  configured now, `loadOwner`) take nothing, log `schedule_ask.dm_unavailable`
  (warn, `reason` `no-token` / `no-owner`) at most once per reason per
  process, and stop the pass, so the ask waits for a bridge; else take the
  ask with `claimRunAsk` (the same compare-and-set as a bridge's post: the
  `ask_posted_at` delivered marker, no schema change) and DM the owner.
- DM content. The DM SHALL be the schedule ask post with no mention and no
  controls: `formatAskReply` with `owner: null`, the schedule title as prefix
  (the name left out when it trips SAFE-13 for a non-owner creator) and the
  run row's summary as stuck context, so the question is SAFE-6 scrubbed,
  mass mentions defanged and the question quoted. A `spend-cap` stop whose cap
  episode this DM claims (`askPingOwner` with `spendAlerts`, SAFE-8) SHALL
  instead carry its details (`formatSpendStopDm`, with the schedule's
  channel; only the owner sees them, SAFE-14.a) after the scrubbed, defanged
  title line; a stop whose episode was already told gets the headline alone.
  It SHALL end with `formatScheduleAskDaemonNote(schedule)`
  (`src/discord/schedule-ask.ts`): no bridge is running so it cannot be
  answered yet; once `corvidinho discord bridge` runs, the schedule's wait
  note brings its controls (`in <#channel>`, or `here` with no channel) when
  its next run comes due; until it is answered or cancelled its next runs
  wait (AUTONOMY-6.a). The whole DM SHALL stay within `DISCORD_DM_MAX`
  (`appendPostLine`).
- Outcome. A DM that goes out SHALL leave the ask taken (a bridge started
  later SHALL NOT post or DM it again, REQ-discord-347) and log
  `schedule_ask.dm_sent` (info: `scheduleId`, `runId`, `reason`). A DM that
  does not go out (resolves null or throws) SHALL hand the ask and the
  episode claim back, log `schedule_ask.dm_failed` (warn, with
  `retryInMinutes`) and be retried after `retryMs`. The ask keeps blocking
  its schedule either way (REQ-discord-606); the pass never sends the wait
  note.
- Stop. `settleAskDelivery(ms)` SHALL, when it times out with an owner DM in
  flight, hand that ask and its episode claim back; a DM that then goes out
  after all takes both again.
- REST DM. `createRestSendDm({ token, rest?, onError? })`
  (`src/discord/rest-dm.ts`) SHALL return a `SendPrivateDm` that needs no
  gateway: `POST /users/@me/channels` with `recipient_id` (a non-snowflake
  user id is refused before any call), then `POST /channels/<id>/messages`
  with the content (`boundedContent`: `@everyone` / `@here` defanged, over
  `DISCORD_DM_MAX` refused before any call, never cut) and
  `allowed_mentions: { parse: [] }`, no components. It SHALL resolve
  `{ channelId, messageId }` (both ids snowflakes) or null, never throw, and
  hand `onError` one scrubbed reason line (`formatErrorLine`; a throwing
  `onError` is ignored); the token SHALL only reach the REST client (default:
  discord.js `REST` v10, created on first use; `rest` is the test seam).
  `resolveDiscordToken(env)` (`src/discord/config.ts`) SHALL be the bot token
  the bridge logs in with (`DISCORD_BOT_TOKEN`, else `DISCORD_TOKEN`).

No new env var, config key, slash command, table or schema version.

Acceptance Criteria
- A daemon-wired scheduler with `ownerDm` DMs a stuck run's question to the owner once (schedule line, stuck headline, quoted question, no `<@`, the daemon note naming the channel), takes the ask (`ask_posted_at`), logs `schedule_ask.dm_sent`, sends nothing more on later ticks, and a bridge-wired scheduler on the same DB posts and DMs nothing.
- A clarify question of a schedule with no channel is DMed with no mention and the note's `here`; the next due run is skipped while it is open.
- While `bridgeLive()` is true, or throws, nothing is DMed and the ask stays pending; once false, the next tick DMs it.
- No `send`: nothing is taken and `schedule_ask.dm_unavailable` (`no-token`) is logged once over several ticks; no owner: the same with `no-owner`.
- A DM that resolves null or throws hands the ask back, logs `schedule_ask.dm_failed` (`retryInMinutes` 5 with a 5-minute `retryMs`), is not retried within the wait, and is sent once after it.
- A channel `/admin` removed from the live allowlist gets no DM and the ask stays pending until the channel is back.
- A question with a token-shaped secret and `@here`, on a schedule named with `@everyone`, is DMed with the secret redacted and both mentions defanged.
- A spend-cap stop DMs its details (`Only you see these details`, `In <#channel>`) once per cap episode; a second schedule's stop in the same episode gets only the headline; both end with the daemon note.
- A stop whose `settleAskDelivery(20)` times out with a DM in flight hands the ask back (`ask_posted_at` null); the DM then going out takes it again.
- `createRestSendDm` opens the DM channel and posts the defanged content with `allowed_mentions.parse = []`, resolving both ids; content over `DISCORD_DM_MAX`, a non-snowflake user id, and a response without an id resolve null; a REST error resolves null with one scrubbed `onError` line; a throwing `onError` never makes it throw.
- `formatScheduleAskDaemonNote` names `<#channel>` for a schedule with a channel and `here` without one.

## Modified

### REQUIREMENT REQ-discord-347

A schedule run that stops to ask a human SHALL reach Discord even when the
ticker that claimed it has no Discord connection (AUTONOMY-2, AUTONOMOUS-7;
`corvidinho daemon`, CLI-8 / AUTONOMOUS-4). The daemon SHALL still need no
Discord token (REQ-cli-108): it records the ask, and the bridge posts it;
while no bridge runs on the data dir, a daemon that has a bot token and an
owner DMs it to the owner instead (AUTONOMOUS-7.a, REQ-discord-707).

- Record. When a schedule run ends with an ask (`stuck`, `clarify` or
  `spend-cap`), the run-finish write SHALL store the ask on the run's
  `schedule_runs` row: `ask_reason`, and `ask_question` written through
  `scrubSecrets` (SAFE-6) and capped at `ASK_QUESTION_MAX`, with
  `ask_posted_at` unset (schema v11). `ask_question` SHALL be listed in
  `SCRUB_TARGETS`. A run without an ask stores none.
- In-process post. A ticker that can post (the bridge) SHALL take the ask it
  is about to post with a compare-and-set on `ask_posted_at IS NULL` before
  posting it, as today, so no other ticker posts it too. A run whose creator
  or channel the live DISCORD-SCHEDULE-3 gate (REQ-discord-020) refuses posts
  nothing and its ask stays pending.
- Delivery. On each scheduler tick a ticker that can post SHALL, without
  awaiting it (DISCORD-SCHEDULE-4), deliver pending asks: for each schedule
  whose newest finished run (by completion time) has an ask no ticker took,
  when the schedule has a channel (or, with no channel, the bridge can DM
  the configured owner, AUTONOMY-6.a / REQ-discord-606) and its creator and channel pass the same
  live DISCORD-SCHEDULE-3 gate as a run's post (REQ-discord-020: the creator
  through `gateActor`, deny wins, a non-empty user/role list must list the
  creator unless they are the configured owner; the channel through
  `checkChannel`), it SHALL take the ask with the same compare-and-set, which also re-checks
  that the run is still its schedule's newest finished run, and post it
  through the schedule ask post (with its REQ-discord-606 controls, to the
  schedule's channel or the owner's DM): the schedule prefix and the question, the owner
  pinged for `stuck` and `spend-cap` and the schedule creator for `clarify`
  (AUTONOMY-4), at most once per question per schedule (`askPingKey`) and
  a `spend-cap` ask at most once per cap episode (`claimCapPing`, SAFE-8),
  no reply hint on a `spend-cap` ask, and no question quote, amount or
  warning on it (only "💸 Work is paused for budget.", SAFE-14.a): when the
  post claims the episode's owner ping the stored question goes to the
  owner by DM (REQ-discord-098), and every tick runs the owner's spend DM
  pass. A post that does not go out (resolves `false` or throws) SHALL hand
  the ask and the cap ping back, keep no ping key, log a
  scrubbed `[scheduler] ask failed: …` line when it threw, and be retried on
  a later tick. Only one delivery pass SHALL run at a time.
- Staleness. An older pending ask SHALL NOT be posted once a later run of
  that schedule has finished, including a run that finishes while a
  delivery pass is posting another ask, nor once it was answered or
  cancelled (REQ-discord-606; the take re-checks `ask_closed_at IS NULL`),
  and a deleted schedule's asks SHALL NOT be posted. Runs recorded before schema v11 carry no ask and SHALL NOT
  be posted.
- Stop. After the scheduler's `stop()` a delivery pass SHALL take no
  further ask, and the bridge's stop SHALL wait at most
  `ABANDONED_SETTLE_MS` (3 s, `settleAskDelivery`) for a post in flight
  before it closes the gateway, so that ask is either posted or handed back
  for the next start.
- A ticker with no outbound (the daemon) SHALL NOT post asks to a channel;
  it keeps logging `run.needs_human` (REQ-cli-098). It SHALL take an ask only
  through its owner DM pass (`ownerDm`, REQ-discord-707), with the same
  compare-and-set, while no bridge runs on the data dir; an ask it DMed is
  taken (`ask_posted_at` set), so this delivery pass SHALL NOT post it again.
  A ticker with neither (no outbound, no `ownerDm`) SHALL NOT take or post
  asks.

No new slash command, env var or channel; the only DMs are the owner's spend
DM (SAFE-14.a, REQ-discord-098), for a schedule with no channel its ask
and wait note to the owner (AUTONOMY-6.a, REQ-discord-606), and the daemon's
owner DM of a pending ask while no bridge runs (AUTONOMOUS-7.a,
REQ-discord-707).

Acceptance Criteria
- A daemon-wired scheduler's stuck run stores `ask_reason` `stuck` and the question with `ask_posted_at` null and posts nothing; a bridge-wired scheduler on the same DB posts it on its next tick once, to the schedule channel, with the prefix, the stuck headline, the question and the owner mention (`mentionUserIds` [owner]); later ticks post nothing more.
- A daemon clarify ask posts with only the schedule creator mentioned.
- A daemon spend-cap ask posts the schedule line and "💸 Work is paused for budget." with the owner pinged, no question, no warning and no reply hint, and hands the stored question to the owner's DM pass once; a second one in the same episode posts without a ping or DM; an episode another surface already pinged posts without a ping; one whose channel post fails on three ticks (retried each tick, its cap ping handed back) DMs the owner its details once, and posts with the ping once the channel works.
- The same question from two daemon runs (the first cancelled, REQ-discord-606) pings once; of two asks of one schedule only the newest, open one posts.
- A cancelled ask, a later finished run, or deleting the schedule, leaves nothing to post.
- An ask cancelled while a delivery pass is posting another schedule's ask is not posted.
- After `stop()` a delivery pass finishes the post in flight and takes no other ask (it stays pending for the next start); `settleAskDelivery(ms)` resolves false while that post is still going; the bridge's stop closes the gateway only after a pending-ask post in flight resolved.
- A channel the bridge's allowlist refuses gets no post and the ask stays pending.
- A creator the bridge's live allowlist no longer lists, or deny-lists, gets no post and the ask stays pending; once `/admin` puts them back (the shared allowlist edited in place) the next tick posts it with its ping.
- A post that resolves `false` or throws leaves the ask pending with no ping key (the throw is logged); the next tick posts it with the ping.
- A run the bridge claimed and posted is not posted again by its ticks; two bridge tickers on one DB post a pending ask once.
- A v10 DB migrates to v11 keeping its runs, none of which is pending; a secret in the question is redacted at rest and in the post; `rescrubDatabase` re-scrubs `ask_question`.
- `corvidinho daemon` logs `run.needs_human` for a stuck run and a Discord bridge started on the same data dir posts the ask to the owner once.
- Every ask this pass posts carries its REQ-discord-606 controls; a schedule with no channel gets it by DM to the owner (never a channel post), and with no DM path or no owner it stays pending.
- An ask the daemon's owner DM pass took (REQ-discord-707) is not posted by a bridge-wired ticker on the same DB; that ticker posts only its wait note, with the controls, once a due run waits on it.

### REQUIREMENT REQ-discord-353


A schedule SHALL NOT stop, or fail to start a run, silently (AUTONOMY-2:
"When stuck, it pings the configured owner on Discord rather than dying
silently"). Two schedule-run outcomes SHALL record a `stuck` ask on the
run's `schedule_runs` row, so the REQ-discord-347 ask post and delivery
pass ping the owner:

- Pre-run failure. A run whose project cannot be resolved (`project resolve
  failed: …`) or whose worktree cannot be created (`worktree failed: …`),
  including a step that throws instead of returning an error, SHALL still
  spawn no agent and be recorded failed with that full error,
  and SHALL record a stuck ask whose question is fixed text naming the step
  (`PROJECT_RESOLVE_FAILED_QUESTION`, `WORKTREE_FAILED_QUESTION`), never the
  host path or the error text (REQ-discord-418, SAFE-6), so a repeat of the
  same failure keeps one ping key. Like every recorded ask it blocks the
  schedule (AUTONOMY-6.a, REQ-discord-606): the next due runs wait instead
  of failing again, so a pre-run failure never counts toward the auto-pause.
- Auto-pause. The run whose failure makes `FAILURE_AUTO_PAUSE` (5) failures
  in a row, counted in SQL in the same run-finish transaction as today
  (REQ-discord-108), SHALL store the stuck `autoPauseAsk` in that same write
  instead of its own ask: `Paused after 5 failed runs in a row. Fix the
  cause, then resume it with /schedule resume.`, followed by a
  `Last failure: <question>` line when the run stopped with its own ask. The
  pause itself is unchanged (status `paused`, ping key cleared). A run that
  succeeds SHALL never store it. The pause ask blocks the schedule too
  (REQ-discord-606): `/schedule resume` SHALL NOT close it, so a resumed
  schedule waits until it is answered or cancelled.
- Delivery. A ticker that can post (the bridge) SHALL post such an ask of
  its own run at once through the in-process ask post of REQ-discord-347
  (live DISCORD-SCHEDULE-3 gate, compare-and-set take, schedule prefix, stuck
  headline, the owner mentioned, once per question per schedule through
  `askPingKey`, with its REQ-discord-606 controls; with no channel, to the
  owner by DM); the pausing run's ask SHALL replace its plain `❌` post.
  When the pausing run had no ask of its own, the post's context SHALL be
  only what that `❌` post showed (its DISCORD-3.b failed line,
  REQ-discord-032: the reason on the owner's own schedule, else `That didn't
  work — the owner has been told.` or `That didn't work.`; the summary the
  run row keeps and the delivery pass posts), never the run's own output; a run
  that throws posts its pause ask at once with no context. An in-process
  post of the pause ask that does not go out (resolves `false` or throws)
  SHALL hand the ask back with no ping key kept, so a later delivery pass
  posts it: a paused schedule has no next run to post it. Every other
  in-process ask post SHALL be handed back the same way, since an open ask
  makes the schedule's next runs wait (REQ-discord-606). An ask a ticker
  with no outbound (the daemon) recorded SHALL be posted by the bridge's
  next delivery pass, unless the daemon's owner DM pass took it first
  while no bridge ran on the data dir (AUTONOMOUS-7.a, REQ-discord-707):
  then that bridge posts only its wait note (REQ-discord-606).
  `ScheduleRunFinished.askReason` SHALL be
  `stuck` for these runs, so the daemon logs `run.needs_human`
  (REQ-cli-098).
- Gate. A run the DISCORD-SCHEDULE-3 gate refuses (REQ-discord-020) SHALL
  still record no ask of its own and post nothing; when refused runs
  auto-pause the schedule, the pause ask SHALL stay pending until the gate
  passes, like any pending ask.

Every schedule post in the channel — the `✅` / `❌` result line and every
ask post, in-process or from the delivery pass, including the stuck asks
above — SHALL start with the schedule prefix
`Schedule **<name>** (<id>) on <project>`, where the project is shown by
name (`projectLabel`: the last segment of an absolute path, a relative name
as given), never as an absolute host path (REQ-discord-418, SAFE-6): the
whole channel reads it. The run row SHALL keep the full error and the
model's prompt SHALL keep the stored project.

No new slash command, env var, config key or table; `/schedule resume` is
the existing ADMIN subcommand. The columns that keep an ask open or closed
are schema v15 (REQ-discord-606).

Acceptance Criteria
- A daemon-claimed run that makes 5 failures in a row pauses the schedule and stores `ask_reason` `stuck` with the pause question and `ask_posted_at` null; `onRunFinished` reports `autoPaused: true` and `askReason: "stuck"`; the bridge's next tick posts it once with the schedule prefix, the stuck headline, the pause line, the run's DISCORD-3.b failed line as context (`That didn't work.` for someone else's schedule the daemon ran, which cannot DM the owner) and `mentionUserIds` [owner]; the 4 earlier failures record no ask and post nothing.
- A stuck run that makes the 5th failure posts one ask: the pause line followed by `Last failure: <its question>`.
- A bridge-claimed run that makes the 5th failure posts the pause ask with the owner ping and the run's DISCORD-3.b failed line as context (not the run's output) instead of the `❌` line (the 4 earlier ones post `❌` with no ping), records the ping key and is not posted again.
- A bridge-claimed pause ask whose post resolves `false` or throws stays pending with no ping key; the next tick posts it once with the owner ping.
- A bridge run that throws and makes the 5th failure posts the pause ask at once with the owner ping and without the error text.
- Refused runs that auto-pause the schedule spawn no agent and post nothing; once the creator is allowed again the next tick posts the pause ask with the owner ping.
- A daemon run whose project cannot be resolved spawns no agent, keeps `project resolve failed: …` (with the host path) on the row and stores the fixed question; the bridge posts it with the owner ping and without the host path; after Cancel (REQ-discord-606) the same failure again posts without a ping.
- A bridge run whose worktree cannot be created keeps `worktree failed: …` on the row and posts the fixed question at once with the owner ping, once; so does one whose worktree step throws.
- The pause ask is chosen by the failure count in SQL: a store handle whose cache is stale stores it when SQL reaches 5; a success stores no ask and resets the count.
- A schedule whose project is an absolute host path posts its `✅` and `❌` result lines, its clarify and stuck asks (bridge-claimed and daemon-claimed) and its pre-run stuck ask (an absolute sibling project that cannot be resolved) with the project's name in the prefix and never the absolute path; the run row keeps `project resolve failed: …` with the path and the model's prompt keeps the stored project.
- A run that could not start blocks its schedule: the next five due slots are skipped with no run recorded, the schedule stays active (no auto-pause) and one wait note goes out (REQ-discord-606).
- After an auto-pause, `/schedule resume` leaves the pause ask open: the next due run is skipped with the one wait note; once the owner answers it the next due run goes.
- A bridge-claimed ask of any kind whose in-process post resolves `false` stays pending and the next tick posts it once, with its controls.
