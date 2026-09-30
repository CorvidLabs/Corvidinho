---
module: discord
change: a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note
---

# Delta: discord (a schedule's question can be answered or cancelled by the owner or its creator, and its next runs wait with one note, AUTONOMY-6.a)

## Added

### REQUIREMENT REQ-discord-606

A schedule run's question SHALL be answerable or cancellable on Discord by
the schedule's creator or the owner, and the schedule's next runs SHALL
wait, with one note, until it is (AUTONOMY-6.a, from Leif's 2026-09-28
interview; parent AUTONOMY-6 "Session stays blocked until a substantive
answer or an explicit cancel").

- Every ask blocks. Every ask a schedule run records on its `schedule_runs`
  row (REQ-discord-347: a run's own `clarify`, `stuck` or `spend-cap` ask;
  REQ-discord-353: a run that could not start and the auto-pause; the
  SAFE-13 refusal of REQ-discord-713) SHALL be open (`ask_blocking` 1,
  `ask_closed_at` null) until it is answered or cancelled. Only the ask of
  the schedule's newest finished run counts; a later finished run makes an
  older one moot, as for delivery. `/schedule resume` SHALL NOT close it.
- Waiting. While a schedule has an open ask, every ticker (the bridge's and
  `corvidinho daemon`'s) SHALL skip each due run: `next_run_at` moves to the
  next cron slot with the same compare-and-set as a claim (so two tickers
  skip it once), no run is recorded, the run counters stay, and nothing is
  made up once the ask closes (the next run is the next slot's). The tick's
  `skipped` list includes it. The first skip SHALL stamp `ask_skip_at` on
  the open ask; a ticker that can post SHALL then, in its delivery pass and
  after the ask itself went out, post one wait note per open ask
  (`formatScheduleWaitNote`: the schedule prefix and that its next runs wait
  until its last question is answered or cancelled, skipped runs not made
  up), taken with a compare-and-set on `ask_note_at` and handed back when it
  does not go out; it SHALL mention nobody and name no amount, SHALL
  carry the ask's own controls (the same row as the ask post, below), so an
  ask whose post was lost (a crash between its claim and its post, or a
  deleted message) can still be answered or cancelled, and SHALL pass the
  same live DISCORD-SCHEDULE-3 gate as any schedule post.
- Controls. The ask post (in-process or from the delivery pass) SHALL carry
  one row of buttons that reuse the DISCORD-ASK controls with the run id
  (`srun_<id>`) as the ask id: **Choose** (`cvask:open:srun_<id>`) when its
  choices fit a short list (ask-human options, else a numbered list in the
  question, stored scrubbed in `ask_options`), else **Answer** (the same
  `open` custom id, opening the private form of REQ-discord-548), and
  **Cancel** (`cvask:cancel:srun_<id>`, a new `cancel` kind of
  `parseAskCustomId`). A `spend-cap` stop SHALL carry **Cancel** only
  (continuing past the cap is not a choice here) and its post SHALL stay
  "💸 Work is paused for budget." (SAFE-14.a). The post's hint line
  (`SCHEDULE_ASK_CHOOSE_HINT` / `SCHEDULE_ASK_ANSWER_HINT`, none for a
  spend-cap stop) SHALL name its buttons and never invite a reply: a
  channel reply SHALL NOT answer a schedule ask (schedule posts are not
  session-tracked). An ask post that does not go out SHALL be handed back
  for the next delivery pass.
- No channel. A schedule with no channel SHALL send its ask, its controls
  and its wait note to the live owner by DM (`SchedulerOutbound.dm`, wired
  to the bridge's `sendDm`, the approval engine's DM path); with no owner
  or no DM path nothing is sent and the ask stays pending.
- Presses (`handleScheduleAskPress`, routed by the bridge for every
  `srun_` ask id). In order, each refusal ephemeral and leaving the ask
  open: the channel — for a schedule with a channel, the press channel and
  the schedule's channel still allowlisted (`componentChannelAllowlisted`;
  zero-width ack, the allowlist tip for an admin); for a schedule with no
  channel, a DM (no guild) only, with no channel check; the actor gate
  (`gateActor`, zero-width ack); mute / rate (`MUTED` / `RATE_LIMITED`);
  then the ask SHALL be open and the presser the schedule's creator or the
  live owner (`isOwnerDiscord`), else "This choice isn’t for you (or it was
  already answered)". Choose SHALL show the listed choices privately; a
  pick of one of them SHALL close the ask `picked` with its label; an
  option id the ask does not have gets `ASK_CHOICE_EXPIRED` and leaves it
  open. Answer SHALL open the private form; its submit SHALL be SAFE-6
  scrubbed (`normalizeAskAnswer`), `cancel` typed there cancels, a thin
  answer is restated privately with the controls and leaves it open
  (AUTONOMY-5), a non-owner's answer that trips the SAFE-13 detector closes
  nothing and is refused through `refuseInjectedAnswer` (the owner pinged in
  the schedule's channel, one `injection-suspected` row), else it closes the
  ask `answered`. Cancel SHALL close it `cancelled` with no answer. When the
  schedule is paused (the auto-pause, a SAFE-13 refusal, `/schedule pause`)
  the private ack of a pick, a typed answer or a Cancel SHALL add
  `SCHEDULE_ASK_PAUSED_NOTE`: closing the question does not resume it. A
  `spend-cap` ask SHALL refuse Choose, Answer and a form submit like
  someone else's press. Closing is a compare-and-set on `ask_closed_at IS
  NULL` recording `ask_outcome`, `ask_answer` (scrubbed) and
  `ask_closed_by`; nothing runs at the press.
- No lapse. A schedule ask's controls SHALL NOT expire while it is open
  (the ask is kept in SQLite and survives restarts); the ~30-minute expiry
  of DISCORD-ASK-5 (REQ-discord-045) stays for session asks.
- The answer. The schedule's next run SHALL get the question and the
  answer once, after its own prompt: `[Prior question this schedule's last
  run asked (the human answered it, …): <question>]` then `Human answer:`
  and the answer — as given when the owner answered, else fenced as the
  answerer's words (`fenceSpeakerText`, `ask-answer` for a typed answer,
  `ask-pick` for a pick; SAFE-12 / SAFE-12.a). Only while the answered run
  is the schedule's newest finished run (`ScheduleStore.answeredAsk`), so no
  later run gets it again. A cancelled ask hands nothing on.
- Schema v15 (forward-only, idempotent). `schedule_runs` SHALL gain
  `ask_options`, `ask_blocking` (default 0), `ask_closed_at`,
  `ask_outcome`, `ask_answer`, `ask_closed_by`, `ask_skip_at` and
  `ask_note_at`, and a partial index on open asks. An ask recorded before
  it that no bridge has posted yet, on its schedule's newest finished run
  (a daemon's question waiting for a bridge, REQ-discord-347, or a
  handed-back pause ask, REQ-discord-353), has been shown to nobody: the
  migration SHALL make it blocking (`ask_blocking` 1, left open), so the
  next delivery pass posts it with its controls and the upgrade never drops
  it. The migration SHALL close every other ask recorded before it (posted
  without a Cancel, or moot; `ask_outcome` `superseded`), so no schedule
  starts out waiting on a question that had no Cancel, and none of those is
  posted again. `ask_answer` and `ask_options` (JSON) SHALL be
  `SCRUB_TARGETS` (new columns, so no scrub-rules version bump).

No new slash command, env var or config key.

Acceptance Criteria
- A clarify ask blocks: the next due slots are skipped (`{ started: [], skipped: [id] }`), `next_run_at` moves to the next slot, no run row is added and `execution_count` stays; one wait note goes out (no mention; the ask's Answer + Cancel controls) and later skipped slots post no second one; after Cancel the next slot runs (nothing made up at once) with no answer in its prompt.
- A stuck ask, a spend-cap stop and a run that could not start block the same way; a run that could not start never reaches the auto-pause.
- The auto-pause ask blocks; `/schedule resume` leaves it open and the next due slot waits with one note; once the owner answers, the next slot runs.
- An ask claimed for posting whose post never went out (a crash between the claim and the post): the next due slot waits and its one wait note carries the ask's Choose + Cancel, which close it.
- A daemon's due run waits too, stamping `ask_skip_at`; the bridge posts the ask, then the one note.
- Listed choices post Choose + Cancel (`cvask:open:srun_…`, `cvask:cancel:srun_…`) with `SCHEDULE_ASK_CHOOSE_HINT`; free text Answer + Cancel with `SCHEDULE_ASK_ANSWER_HINT`; neither carries the reply hint; a spend-cap stop Cancel only (its note too), its post only "💸 Work is paused for budget." and its note no amount.
- An in-process ask post that resolves `false` is posted, with its controls, by the next tick.
- A schedule with no channel DMs the ask with its controls and the one note (with the same controls) to the owner and posts nothing in a channel; with no owner nothing is sent and the ask stays pending.
- The owner's pick reaches the next run unfenced and only that run; the creator's typed answer is stored scrubbed and reaches the next run fenced (`role: community`); a closed ask cannot be closed again.
- Through `startBridge` with a memory DB and fake interactions: Choose shows the creator the choices privately and a pick closes the ask `picked` (a re-press is "isn't for you"); an unknown option id is `ASK_CHOICE_EXPIRED`; Answer opens the form, a thin submit restates privately with Cancel and keeps it open, a typed submit closes it `answered` with the secret redacted, `cancel` typed cancels; someone else's Cancel or submit is refused and the ask stays open, the owner's and the creator's Cancel close it; a spend-cap ask refuses Choose and a submit and takes Cancel; an ask three days old still takes a pick; a press outside the allowlisted channel, or once the schedule's channel left the allowlist, gets the zero-width ack (the tip for the owner); a deny-listed creator gets the zero-width ack and a muted one `MUTED`; a channel-less schedule's ask is answered in the owner's DM and refused from a guild channel; the creator's injection-like typed answer closes nothing and pings the owner in the schedule's channel; a Cancel id on a session ask is refused; on a paused schedule the ack of a Cancel, a typed answer or a pick ends with `SCHEDULE_ASK_PAUSED_NOTE`, on an active one it does not.
- Through the bridge's own scheduler: the ask post carries Choose + Cancel, a channel reply to it leaves it open and the creator's Cancel closes it; a channel-less schedule DMs its ask and controls to the owner.
- A v14 DB migrates to v15: the eight columns exist; asks recorded before that were posted, or are moot, are closed `superseded`, are neither open nor pending and are not posted again, and that schedule's next due run goes; a still-pending ask on its schedule's newest run becomes open and blocking, its schedule's next due run waits and that ask is posted with Answer + Cancel, then the one note; a re-run changes nothing; `ask_answer` and `ask_options` are re-scrubbed.

## Modified

### REQUIREMENT REQ-discord-045

When an ask has two or more options (from ask-human `options` or a numbered
list parsed from the question), the bridge SHALL post a short public Choose
stub with a button, and on requester press SHALL reply with an ephemeral
interaction listing the option buttons. Button prompts of a session ask
(chat, `/work`, `/session start` and their resumes) SHALL expire after
about 30 minutes; a late press SHALL get a short "that choice expired". A
schedule run's ask (REQ-discord-606, AUTONOMY-6.a) SHALL NOT lapse while it
is open: AUTONOMY-6.a makes the schedule wait until it is answered or
cancelled, so its Choose, Answer and Cancel controls work until then (the
ask is kept in SQLite, `schedule_runs`, and survives restarts); the
~30-minute expiry of DISCORD-ASK-5 stays for session asks only.
Free-text clarify SHALL be used only when options cannot be listed.

A late press SHALL include the requester's Choose or option press on an ask
that is no longer open because it timed out and was dropped, not promoted,
when a newer ask of the session was cleared (REQ-discord-044), or because its
session was TTL-purged (SESSION-2 / REQ-discord-019), at runtime or while the
store loads after a restart. Such a press SHALL get the ephemeral
`ASK_CHOICE_EXPIRED` reply, with no agent run, no new session and nothing
posted or edited, never "This choice isn't for you (or it was already
answered)". A still-stored ask past its timeout SHALL keep that reply and be
cleared, and a later press on it SHALL again get `ASK_CHOICE_EXPIRED`. A
re-press after a pick and a press after an explicit cancel SHALL stay no-ops
with today's reply (DISCORD-ASK-8), also once the session is purged. Another
user's press on a live ask, or on an ask that is no longer open, SHALL get
the not-for-you reply and SHALL NOT resume anything (DISCORD-ASK-2/3). The
channel, actor and mute/rate gates (REQ-discord-212 / REQ-discord-201 /
REQ-discord-010) SHALL run before this reply; for an ask that is no longer
open, the channel gate SHALL judge the press against the channel and thread
its session had, as for a live ask, so a late press in the talk's thread
under an allowlisted channel (DISCORD-2.a) gets `ASK_CHOICE_EXPIRED` too. To
tell a late press from another user's, `SessionStore` SHALL keep, for each
ask that leaves past its timeout or with its purged session, only its askId,
the session's Discord user, the ask's expiry and the session's channel and
thread ids (`findClosedAsk`), in memory only and bounded to the newest
`CLOSED_ASKS_MAX` (1000), never the question or option text (SAFE-6). No new
env var, slash command, table or column.

Acceptance Criteria
- Structured or numbered options → stub + components; ephemeral open shows choices.
- Pick resumes the requester session with the chosen label.
- Expired press returns ASK_CHOICE_EXPIRED and clears pending.
- Question without listable options keeps the free-text ask-ping path.
- When the newest ask is picked while an earlier open ask has timed out, the requester's Choose and option press on the dropped earlier ask each get exactly the ephemeral `ASK_CHOICE_EXPIRED`; the agent does not run and nothing is posted or edited; another user's press on it gets the not-for-you reply.
- With two open asks (neither timed out) and the session idle past its TTL, the requester's Choose and option press on each get the ephemeral `ASK_CHOICE_EXPIRED`, no agent run, no session is created and nothing is posted; another user's press on each gets the not-for-you reply, as it does on the live ask before the purge.
- A still-stored ask past its timeout: the first press gets `ASK_CHOICE_EXPIRED` and clears it; a second press by the requester gets `ASK_CHOICE_EXPIRED` again, another user's the not-for-you reply, and the agent does not run.
- A re-press after a pick and a press after `cancel` get the not-for-you / already-answered reply with no run, before and after the session is TTL-purged.
- A muted or deny-listed requester's press on an ask of a TTL-purged session gets `MUTED` / the zero-width ack; once let through the press gets `ASK_CHOICE_EXPIRED`, with no run and nothing posted.
- In a talk inside a thread under an allowlisted channel, the requester's press in that thread on a dropped ask or on an ask of the TTL-purged session gets `ASK_CHOICE_EXPIRED` with no run; another user's press there gets the not-for-you reply; a press from another thread or a non-allowlisted channel, or once the talk's channel has left the allowlist, gets the zero-width ack.
- `SessionStore.findClosedAsk` returns `{ askId, userId, expiresAt, channelId, threadId? }` (no question or option text) for an earlier ask dropped when the newest is cleared, an ask cleared past its timeout, every open ask of a TTL-purged session and every ask of a session row purged on load; never for a pick of a live ask, a cancel or an askId stored again; past `CLOSED_ASKS_MAX` the oldest is forgotten.
- A schedule ask recorded three days before the press still takes a pick from the owner (no "that choice expired"); session asks keep their ~30-minute expiry.

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
- A ticker with no outbound (the daemon) SHALL NOT take or post asks; it
  keeps logging `run.needs_human` (REQ-cli-098).

No new slash command, env var or channel; the only DMs are the owner's spend
DM (SAFE-14.a, REQ-discord-098) and, for a schedule with no channel, its ask
and wait note to the owner (AUTONOMY-6.a, REQ-discord-606).

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
  only what that `❌` post showed (`failed (exit N)`, the summary the run
  row keeps and the delivery pass posts), never the run's own output; a run
  that throws posts its pause ask at once with no context. An in-process
  post of the pause ask that does not go out (resolves `false` or throws)
  SHALL hand the ask back with no ping key kept, so a later delivery pass
  posts it: a paused schedule has no next run to post it. Every other
  in-process ask post SHALL be handed back the same way, since an open ask
  makes the schedule's next runs wait (REQ-discord-606). An ask a ticker
  with no outbound (the daemon) recorded SHALL be posted by the bridge's
  next delivery pass. `ScheduleRunFinished.askReason` SHALL be
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
- A daemon-claimed run that makes 5 failures in a row pauses the schedule and stores `ask_reason` `stuck` with the pause question and `ask_posted_at` null; `onRunFinished` reports `autoPaused: true` and `askReason: "stuck"`; the bridge's next tick posts it once with the schedule prefix, the stuck headline, the pause line, the `failed (exit 1)` context and `mentionUserIds` [owner]; the 4 earlier failures record no ask and post nothing.
- A stuck run that makes the 5th failure posts one ask: the pause line followed by `Last failure: <its question>`.
- A bridge-claimed run that makes the 5th failure posts the pause ask with the owner ping and the `failed (exit 1)` context (not the run's output) instead of the `❌` line (the 4 earlier ones post `❌` with no ping), records the ping key and is not posted again.
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

### REQUIREMENT REQ-discord-548

When a clarify or stuck ask's choices cannot be listed (the free-text ask of REQ-discord-044 / REQ-discord-045), its public post SHALL stay the short stub that quotes the question and SHALL carry exactly one **Answer** button; the requester's press SHALL open a private form (a Discord modal, interaction response type 9) with one paragraph text input, and the form's submit (interaction type 5, MODAL_SUBMIT) SHALL pass the same gates as a button press and resume the requester's session exactly as a reply that answers the ask would (DISCORD-ASK-4.a, with DISCORD-ASK-2/3/5/7/8). Replying in the channel SHALL still answer it.

- The post is `formatAskReply` (question quoted, requester or owner mention as before) with the hint `ASK_ANSWER_HINT` ("Press **Answer** to answer privately, or reply to this message.") in place of `ASK_REPLY_HINT`, and `buildAnswerStubComponents(askId)`: one Primary button labelled `Answer` on the ask's `open` custom_id. It applies to the chat answer, the follow-up ask of a resumed pick or form submit, the `/work` and `/session start` answer, and a thin-reply restatement while the ask has not timed out (after that the restatement has no button and the reply hint, as before). The post keeps its footer-only embed (it is still the turn's answer, DISCORD-3.a) and its message id is stored as the ask's `stubMessageId`. A SAFE-8 spend-cap stop gets no button and is never pending; a Choose ask (listable options) keeps its Choose stub; a lone option is dropped (free text). A schedule run's free-text ask carries the same Answer button (on its run id, `cvask:open:srun_<id>`) plus Cancel, and its form's submit closes the schedule's ask instead of resuming a session; a reply does not answer it (REQ-discord-606).
- The requester's press on the Answer button (an `open` press on a pending ask without options) SHALL answer with the modal `buildAnswerModal`: `custom_id` `cvask:answer:<askId>`, title `Answer privately`, one Label component (type 18) `Your answer` whose description is the SAFE-6 scrubbed, defanged, one-line start of the question (≤100 chars), around one required paragraph text input (type 4, style 2, `custom_id` `answer`, `min_length` 1, `max_length` `ASK_ANSWER_MAX` = min(`ASK_QUESTION_MAX`, 4000)). The press posts nothing and runs nothing; the ask stays pending. Without a modal-capable interaction the press keeps today's ephemeral "reply in the channel instead".
- The live gateway SHALL route a MODAL_SUBMIT to the component handler with the form's text input values by input custom_id (`modalValues`); its replies parse no mentions and an ephemeral reply is flag 64. Only the form's `answer` custom_id with typed text is taken; a press id with typed text or the form id without it is ignored.
- The submit SHALL pass, in order, the channel gate (REQ-discord-212), the actor gate with deny lists and a non-empty user/role allowlist (REQ-discord-201), mute/rate (REQ-discord-010), the not-yours / already-answered check and the expiry check, exactly as a press; every refusal is ephemeral only (zero-width ack, the admin allowlist tip, `MUTED` / `RATE_LIMITED`, "This choice isn't for you (or it was already answered)", `ASK_CHOICE_EXPIRED`), with no agent run, nothing posted or edited and the ask left pending (DISCORD-DENY). A submit on a Choose ask gets the not-for-you reply.
- A submit whose scrubbed text is thin or an explicit cancel SHALL be handled as the same text in a reply is (AUTONOMY-5/6): a thin or blank answer (`isThinAck`: `ok`, `sure`, emoji-only, whitespace and similar) SHALL NOT clear the ask or run the agent — the question is restated once, privately (an ephemeral `formatAskReply` with `ASK_ANSWER_HINT` and the Answer button); an explicit cancel (`isCancelAsk`: `cancel`, `never mind`, `forget it`, `stop asking`, `nm`) SHALL clear every open ask of the session, as a cancel reply does (SESSION-MULTI-3), with the ephemeral `ASK_CANCELLED_ACK` and no run. Neither posts or edits anything in the channel.
- An accepted submit SHALL be SAFE-6 scrubbed, control characters dropped, trimmed and cut at `ASK_ANSWER_MAX` (`normalizeAskAnswer`); the ask SHALL be cleared first (a reply or second submit cannot resume twice); the submit gets the ephemeral `ASK_ANSWER_ACK`, deleted when the resumed run ends (DISCORD-ASK-8); the session SHALL resume (`resume: true`) with its thread replayed and the prompt `[Prior clarifying question you asked (the human is answering it now):\n<question>]\n\nHuman answer:\n<answer>` — the block a reply that answers the ask gets, `<answer>` being the answer as the same words in a reply reach the model: inside the `fenceSpeakerText` untrusted-data fence (header naming the role, `source=ask-answer`) for a team or community requester, unchanged for the owner (SAFE-12, REQ-discord-071) — with `humanText`, the memory query and the recorded human turn the scrubbed answer (not the fence), the presser's identity, memory and acting role as on a button pick, and the stub as the progress surface (content and button cleared) edited into the answer (DISCORD-ASK-7). The typed text SHALL NOT be posted.
- Before the ask is cleared, a team or community requester's scrubbed answer (not thin, not a cancel) SHALL be scanned by `inboundInjection` exactly as the same words in a chat reply in that session are, and a hit SHALL be refused as that reply is (SAFE-13, REQ-discord-071; `refuseInjectedAnswer`): no agent run, the ask left pending and the session live, nothing added to the thread; the submit gets an ephemeral refusal (`injectionRefusalHead` plus "I've flagged it to the owner", never the text; without an owner or a post function the `formatInjectionRefusal` line, ephemeral); the owner gets one fresh post in the session's channel (thread first), replying to the ask's stub, that pings only them (allowed mentions the owner only) and says an answer typed in the private Answer form looked like a prompt-injection attempt and why; that post is tracked on the session as a chat refusal is; and one `injection-suspected` / `denied` SAFE-5 row is appended (actor the requester, surface `discord:<session>`, digest of `ask-answer` and the reason ids). The owner's own answer is neither scanned nor fenced. The presser's acting role SHALL be resolved before this check by `resolveDiscordActingRole` with the presser's Discord role ids, as on the chat path (the same role a button pick runs with), so a declared team member allowlisted only by a Discord role is team on the form as in chat (REQ-discord-065).
- A button pick's answer is the label of the pressed option, which the model wrote but may have copied from a non-owner's own (fenced) words: for a team or community presser it SHALL reach the resumed run as their words, inside the same `fenceSpeakerText` untrusted-data fence as their typed answer (header naming the role, `source=ask-pick`), the role being the presser's, resolved at press time by `resolveDiscordActingRole` with their Discord role ids as on the Answer form (SAFE-12.a, REQ-discord-071); the label is fenced, not scanned. `humanText`, the memory query and the recorded human turn stay the plain label. The owner's pick SHALL reach the run byte-identical to before (`[Prior clarifying question you asked (the human answered via Discord button):\n<question>]\n\nHuman answer:\n<label>`). The pick's claim of the ask and resume (DISCORD-ASK-3), expiry (DISCORD-ASK-5) and the option buttons cleared at once with "Got it — **<label>**" (DISCORD-ASK-8) are unchanged.
- A pick whose option id matches none of the pressed ask's options (a forged or stale id, or a pick id on a free-text ask) SHALL be treated as expired once it has passed the gates above: the ephemeral `ASK_CHOICE_EXPIRED` only, no agent run, nothing posted or edited, the ask left pending (a real pick, answer or reply still answers it) and the raw option id in no prompt and no thread turn (SAFE-12.a).
- A press or submit on a free-text ask past its ~30-minute timeout SHALL get `ASK_CHOICE_EXPIRED` and run nothing, and the ask SHALL stay pending so a reply still answers it with the prior-question block (unlike a Choose ask, which a late press clears, REQ-discord-045). A reply that answered the ask leaves the Answer button answering "already answered".
- No new env var, config key, slash command, table, column or schema version.

Acceptance Criteria
- A chat clarify ask without listable options: the collapsed stub quotes the question, carries `ASK_ANSWER_HINT` (not `ASK_REPLY_HINT`), exactly one Answer button (`open` custom_id) and a footer embed; the pending ask is free text with the stub as `stubMessageId`. A spend-cap stop has no button and no pending ask.
- The requester's Answer press calls `showModal` with `buildAnswerModal` (title ≤45, one type 18 label ≤45 with the question as description, one required type 4 paragraph input, `max_length` `ASK_ANSWER_MAX` ≤ 4000); nothing is posted, no run, the ask stays. Another user's press gets the not-for-you reply and no form.
- The requester's submit resumes the same session with the reply's prior-question block and the trimmed answer (a community requester's inside the untrusted-data fence, `source=ask-answer`); ephemeral `ASK_ANSWER_ACK` then deleted; the stub is thin-updated and edited into the answer; the typed text is never posted; the ask is cleared and a second submit is "already answered". A secret in the text never reaches the run or the thread.
- Another user's, a muted, a deny-listed (user or role), an off-channel, a rate-limited and a late submit (and the same presses) are refused ephemerally with no run and the ask kept; after the late one a thin reply restates without a button and a reply still answers it.
- A reply to the stub answers the ask as before; a later Answer press or submit is "already answered". A thin reply restates with the live Answer button.
- A thin or blank submit (`ok`, whitespace, `👍`, `sure!`) gets only the private restatement with the Answer button: no run, nothing posted, ask kept, nothing added to the thread; a real submit afterwards resumes. A `never mind` / `cancel` submit gets only the ephemeral `ASK_CANCELLED_ACK`, clears the free-text ask and an earlier open Choose ask of the session, runs nothing, and a later Answer press is "already answered".
- `/work` without listable options answers with the Answer button and hint and records `stubMessageId`; its submit resumes that session in the answer message. A follow-up free-text ask from a resumed run gets its own Answer button in the same stub.
- The live gateway routes a MODAL_SUBMIT with its text to the component handler; `adaptModalSubmit` maps text inputs by id, replies ephemerally with no parsed mentions.
- Through `startBridge` with a memory DB: a community user's and a declared team member's submit that tells the bot to ignore its rules starts no run, gets one ephemeral refusal that never quotes it, leaves the ask pending and the session live (the refusal post continues it), adds nothing to the thread, posts once in the session's channel replying to the stub with allowed mentions only the owner, and appends one `injection-suspected` / `denied` row with the user as actor and surface `discord:<session>`; an ordinary community answer runs inside the fence with `humanText` and the thread turn the plain answer and no audit row; the owner's answer, injection-like words included, runs unfenced with no refusal and no row (`tests/safe.injection.test.ts`).
- A declared team member allowlisted only by a Discord role (a non-empty user / role allowlist) whose chat run is team answers through the form as team too: the run's acting role is team and the fence header names `team` (`tests/safe.injection.test.ts`).
- Through `startBridge` with a memory DB: a community user's and a declared team member's pick resumes the session with the label inside the fence (`role: community` / `role: team`, `source=ask-pick`) after the button prior-question block, `humanText` and the thread turn the plain label, the option buttons cleared with "Got it" and no audit row; a label repeating a community user's injection-like words stays fenced when they pick it; a declared team member allowlisted only by a Discord role picks as team; the owner's pick of an injection-like label resumes unfenced with no refusal and no row; a community user's, a team member's and the owner's press on an option id the ask does not have gets only `ASK_CHOICE_EXPIRED` with no run, nothing posted and the ask kept, a real pick then resumes with the label and no prompt holds the forged id; a pick press on a free-text ask is treated the same and the Answer form still answers it (`tests/safe.injection.test.ts`); a community presser's pick in `tests/discord.ask-ephemeral.test.ts` reaches the run fenced (`source=ask-pick`).
- These tests fail on the base sources.
- A schedule run's free-text ask post carries Answer + Cancel; its Answer opens the same private form (custom_id `cvask:answer:srun_<id>`), whose submit by the creator or the owner closes the ask (REQ-discord-606).
