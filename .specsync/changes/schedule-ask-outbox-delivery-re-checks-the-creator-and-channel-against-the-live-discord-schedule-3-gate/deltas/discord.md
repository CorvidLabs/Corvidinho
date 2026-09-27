---
module: discord
change: schedule-ask-outbox-delivery-re-checks-the-creator-and-channel-against-the-live-discord-schedule-3-gate
---

# Delta — discord (schedule ask delivery passes the live DISCORD-SCHEDULE-3 gate)

## Modified

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
  posting it, as today, so no other ticker posts it too. A run whose creator
  or channel the live DISCORD-SCHEDULE-3 gate (REQ-discord-020) refuses posts
  nothing and its ask stays pending.
- Delivery. On each scheduler tick a ticker that can post SHALL, without
  awaiting it (DISCORD-SCHEDULE-4), deliver pending asks: for each schedule
  whose newest finished run (by completion time) has an ask no ticker took,
  when the schedule has a channel and its creator and channel pass the same
  live DISCORD-SCHEDULE-3 gate as a run's post (REQ-discord-020: the creator
  through `gateActor`, deny wins, a non-empty user/role list must list the
  creator unless they are the configured owner; the channel through
  `checkChannel`), it SHALL take the ask with the same compare-and-set, which also re-checks
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
- A creator the bridge's live allowlist no longer lists, or deny-lists, gets no post and the ask stays pending; once `/admin` puts them back (the shared allowlist edited in place) the next tick posts it with its ping.
- A post that resolves `false` or throws leaves the ask pending with no ping key (the throw is logged); the next tick posts it with the ping.
- A run the bridge claimed and posted is not posted again by its ticks; two bridge tickers on one DB post a pending ask once.
- A v10 DB migrates to v11 keeping its runs, none of which is pending; a secret in the question is redacted at rest and in the post; `rescrubDatabase` re-scrubs `ask_question`.
- `corvidinho daemon` logs `run.needs_human` for a stuck run and a Discord bridge started on the same data dir posts the ask to the owner once.
