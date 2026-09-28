---
module: discord
change: daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once
---

# Delta — discord (needs-human outbox for schedule runs another ticker claimed)

## Added

### REQUIREMENT REQ-discord-347

A schedule run that stops to ask a human SHALL reach Discord even when the
ticker that claimed it has no Discord connection (AUTONOMY-2, AUTONOMOUS-7;
`corvidinho daemon`, CLI-8 / AUTONOMOUS-4). The daemon SHALL still need no
Discord token (REQ-cli-108): it records the ask, and the bridge posts it.

- Record. When a schedule run ends with an ask (`stuck`, `clarify` or
  `spend-cap`), the run-finish write SHALL store the ask on the run's
  `schedule_runs` row: `ask_reason`, and `ask_question` written through
  `scrubSecrets` (SAFE-6) and capped at `ASK_QUESTION_MAX`, with
  `ask_posted_at` unset (schema v11). `ask_question` SHALL be listed in
  `SCRUB_TARGETS`. A run without an ask stores none.
- In-process post. A ticker that can post (the bridge) SHALL take the ask it
  is about to post with a compare-and-set on `ask_posted_at IS NULL` before
  posting it, as today, so no other ticker posts it too. A run whose channel
  the allowlist refuses posts nothing and its ask stays pending.
- Delivery. On each scheduler tick a ticker that can post SHALL, without
  awaiting it (DISCORD-SCHEDULE-4), deliver pending asks: for each schedule
  whose newest finished run (by completion time) has an ask no ticker took,
  when the schedule has a channel that the bridge's channel allowlist allows,
  it SHALL take the ask with the same compare-and-set, which also re-checks
  that the run is still its schedule's newest finished run, and post it
  through the schedule ask post: the schedule prefix and the question, the owner
  pinged for `stuck` and `spend-cap` and the schedule creator for `clarify`
  (AUTONOMY-4), at most once per question per schedule (`askPingKey`) and
  a `spend-cap` ask at most once per cap episode (`claimCapPing`, SAFE-8),
  no reply hint on a `spend-cap` ask, and the pending 80% warning riding the
  post. A post that does not go out (resolves `false` or throws) SHALL hand
  the ask, the warning and the cap ping back, keep no ping key, log a
  scrubbed `[scheduler] ask failed: …` line when it threw, and be retried on
  a later tick. Only one delivery pass SHALL run at a time.
- Staleness. An older pending ask SHALL NOT be posted once a later run of
  that schedule has finished, including a run that finishes while a
  delivery pass is posting another ask, and a deleted schedule's asks SHALL
  NOT be posted. Runs recorded before schema v11 carry no ask and SHALL NOT
  be posted.
- Stop. After the scheduler's `stop()` a delivery pass SHALL take no
  further ask, and the bridge's stop SHALL wait at most
  `ABANDONED_SETTLE_MS` (3 s, `settleAskDelivery`) for a post in flight
  before it closes the gateway, so that ask is either posted or handed back
  for the next start.
- A ticker with no outbound (the daemon) SHALL NOT take or post asks; it
  keeps logging `run.needs_human` (REQ-cli-098).

No new slash command, env var, DM or channel.

Acceptance Criteria
- A daemon-wired scheduler's stuck run stores `ask_reason` `stuck` and the question with `ask_posted_at` null and posts nothing; a bridge-wired scheduler on the same DB posts it on its next tick once, to the schedule channel, with the prefix, the stuck headline, the question and the owner mention (`mentionUserIds` [owner]); later ticks post nothing more.
- A daemon clarify ask posts with only the schedule creator mentioned.
- A daemon spend-cap ask pings the owner with the pending 80% warning and no reply hint; a second one in the same episode posts without a ping; an episode another surface already pinged posts without a ping.
- The same question from two daemon runs pings once; of two pending asks of one schedule only the newest posts.
- A later finished run, or deleting the schedule, leaves nothing to post.
- A later run that finishes while a delivery pass is posting another schedule's ask makes that schedule's pending ask moot: it is not posted.
- After `stop()` a delivery pass finishes the post in flight and takes no other ask (it stays pending for the next start); `settleAskDelivery(ms)` resolves false while that post is still going; the bridge's stop closes the gateway only after a pending-ask post in flight resolved.
- A channel the bridge's allowlist refuses gets no post and the ask stays pending.
- A post that resolves `false` or throws leaves the ask pending with no ping key (the throw is logged); the next tick posts it with the ping.
- A run the bridge claimed and posted is not posted again by its ticks; two bridge tickers on one DB post a pending ask once.
- A v10 DB migrates to v11 keeping its runs, none of which is pending; a secret in the question is redacted at rest and in the post; `rescrubDatabase` re-scrubs `ask_question`.
- `corvidinho daemon` logs `run.needs_human` for a stuck run and a Discord bridge started on the same data dir posts the ask to the owner once.

## Modified

### REQUIREMENT REQ-discord-108

The Discord bridge and `corvidinho daemon` may tick schedules from one data
dir at the same time (CLI-8 / AUTONOMOUS-4). Schedule ticks SHALL then stay
correct:

- Each tick SHALL re-read the `schedules` table first, so schedules created,
  paused, resumed or deleted by another process are seen.
- Each due run SHALL be claimed with a compare-and-set on `status = 'active'`
  and the `next_run_at` the ticker saw. A run another ticker already claimed
  SHALL be skipped, so each due run fires exactly once.
- Store updates SHALL write only the columns they own. Status changes write
  status / next_run_at / updated_at; run start writes last_run_at /
  execution_count / next_run_at / updated_at; run finish writes
  consecutive_failures (counted in SQL) / updated_at, and on the run row its
  outcome and ask (`ask_reason` / `ask_question`, REQ-discord-347); taking
  or handing back a run's ask writes only `ask_posted_at`, with a
  compare-and-set so one ticker takes it. A run finishing in one
  process SHALL NOT undo a pause or resume made in another.
- The scheduler SHALL record each run's outcome exactly once, even when a
  shutdown abandons a run that later returns.
- A run abandoned at shutdown SHALL also be stopped: `abandonInFlight` aborts
  the run's signal, and the spawn client (`AgentRunChatOpts.signal`) kills
  the spawned agent's whole process tree (AGENT-3 / REQ-plugins-154),
  including a process the agent left in its group that still holds the
  output pipe after the agent exited. The spawn client SHALL start each
  agent in its own process group and stop its tree when the bridge or
  daemon process exits. `ScheduleStore` SHALL start
  runs only through `claimRun` (the unused unconditional `markRunStarted` is
  removed).

Existing tick behaviour is unchanged: the 60 s poll, max 2 concurrent runs,
no catch-up, auto-pause after 5 failures, and the non-blocking tick
(DISCORD-SCHEDULE-4). The claim itself needs no schema change; the ask
columns are schema v11 (REQ-discord-347).

Acceptance Criteria
- Two tickers on one DB file start a due run once; one run row, `execution_count` 1.
- A tick sees create/pause/resume/delete made through another store handle.
- A pause made while a run is in flight survives that run finishing.
- Failures from two handles with stale caches still count to 2.
- `abandonInFlight` records a stuck run as failed once; a late agent result does not record it again.
- `abandonInFlight` aborts the signal the stuck run's agent was given.
- An abort after the spawned agent exited, while its background child still holds the output pipe, kills that child and `runChat` returns.
- A run's ask is taken by one ticker only: two bridge-wired tickers on one DB post a pending ask once (REQ-discord-347).
