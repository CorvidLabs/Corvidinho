---
module: discord
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
---

# Delta: discord (WATCH spend-cap stops DM the owner once per cap episode; the unknown-price card's outcome; a schedule's spend-cap stop takes the owner's Continue, SAFE-16.a / AUTONOMY-8)

## Added

### REQUIREMENT REQ-discord-199

It asks before any spend that would go over a cap (AUTONOMY-8), and an
unknown price shows as unknown, never as free (SAFE-16 / SAFE-16.a), on the
bridge's side:

- WATCH spend-cap stops. `createWatchAskDelivery` SHALL also deliver the
  `spend-cap` stops the watch process records (REQ-watch-099): each is taken
  (compare-and-delete) and, once per episode of the caps it names
  (`claimCapPing(spendScopesOf(ask))` on the spend alert outbox —
  `createSpendAlertOutbox` over the bridge's DB unless one is passed — the
  same once-per-episode claim as a chat or schedule stop's owner ping), DMed
  to the owner only as `formatWatchSpendStopDm`: the SAFE-14.a spend-stop DM
  (`SPEND_STOP_DM_HEAD`, then the quoted, scrubbed and defanged question with
  the amounts, caps and what the card came to) with `GitHub <owner/repo>#<n>:
  <link>` as its second line and no mention. A stop whose episode was already
  told SHALL be taken and dropped with one log line, not DMed. A DM that does
  not go out SHALL hand back both the episode claim and the ask (retried after
  `WATCH_ASK_RETRY_MS`). The GitHub side, the one-day limit, the no-owner and
  no-gateway waits and the stop grace are as for stuck asks (REQ-discord-086);
  log lines say `WATCH spend-cap stop` and `AUTONOMY-8` and name no amount.
- Unknown-price card. The `spend` kind SHALL answer an approved card whose
  amount is unknown (`isUnknownSpendAmount`) with
  `SPEND_CARD_UNKNOWN_APPROVED` ("… sends exactly this one call; its cost
  stays unknown (never $0), and the next call at an unknown price asks
  again (SAFE-16.a)"); other cards keep `SPEND_CARD_APPROVED`.

No new env var, config key, slash command, table or schema version.

Acceptance Criteria
- A recorded WATCH spend-cap stop: a failed DM hands back the ask (still pending) and the episode claim; the next pass DMs the owner once: the first line is `SPEND_STOP_DM_HEAD`, the second `GitHub CorvidLabs/Corvidinho#7: <link>`, then the quoted `Daily spend cap reached (SAFE-8): $4.9990 spent …`, with no `<@` mention.
- Another thread's spend-cap stop in the same cap episode is taken and not DMed; the log says the owner was already told about this cap episode.
- The engine DMs an unknown-price card with `Amount: unknown (…)` and answers Approve plus the code with `SPEND_CARD_UNKNOWN_APPROVED`.
- These tests fail on main's sources.

## Modified

### REQUIREMENT REQ-discord-086

When a GitHub run is stuck and needs me, it pings me on Discord like other
stuck asks (AGENT-16.a, captured with `hi` in this change from Leif's
2026-09-30 decision, interview round 13). With a DB the bridge SHALL build
`createWatchAskDelivery` (`src/discord/watch-ask.ts`) and run one
`deliver()` pass on every scheduler tick (`onTick`, alongside the forget
cards; one pass at a time, never rejecting) over the asks the watch process
recorded (REQ-watch-086). An ask older than `WATCH_OWNER_ASK_TTL_MS` (a day)
SHALL be taken and given up with a log line, never sent. With the gateway's
`sendDm` and an owner Discord id, each other stuck ask SHALL be taken
(compare-and-delete, so two bridges never both send it) and sent to the owner
only, by direct message, as `formatWatchStuckAskDm` (a spend-cap stop the
watch process recorded is delivered as REQ-discord-199 says): the `formatAskReply`
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
- A recorded spend-cap stop is DMed as REQ-discord-199 says (once per cap episode), not as a stuck ask.

### REQUIREMENT REQ-discord-198

The bridge SHALL register the `spend` card kind on its one Approve/Deny card
engine (REQ-discord-096), next to the forget and must-ask kinds, so a model
call a run held at a spend cap (REQ-agent-198) reaches the owner as a DM
card (SAFE-8, SAFE-18). `src/discord/spend-card.ts` `spendApprovalKind`
SHALL be a stored kind over `approval_requests` (`storedApprovalKind`) with
class `money` — Approve answers with the code step and DMs the one-time code
apart; only the right code typed into the form, for that card and the exact
action it shows, before it expires, approves it (SAFE-19) — audit prefix
`spend-cap` (`spend-cap-card`, `-approve`, `-deny`, `-expire` SAFE-5 rows),
"nothing was spent" as what a no leaves undone, and `SPEND_CARD_APPROVED` as
the approved outcome (`SPEND_CARD_UNKNOWN_APPROVED` for a card whose amount
is unknown, REQ-discord-199). Approve SHALL only record the decision: the waiting
run reads it, uses it once and sends exactly the call the card showed, at
that amount (SAFE-8.a). Any process on the data dir SHALL be able to raise
the card (chat and slash runs, schedules, WATCH, the daemon, delegate and
council workers, the CLI); the running bridge delivers it on the engine's
own poll and after each chat run. The card SHALL show, before it, the run's
task and context as quoted-data text, then the action, target and amount one
line each; the requester and channel SHALL see no amounts (SAFE-14.a). Deny,
no answer before it lapses, a late code, a press or code from anyone but the
owner, or a card whose waiting process is gone (its `<pid>:<proc start>`)
SHALL be a no (SAFE-20): the card closes and nothing is spent. Nothing else in
the bridge changes for it.

Acceptance Criteria
- With the engine and a run paused near its cap, the owner is DMed the task as quoted data first, then the card with `**Spend past a cap — asks first (SAFE-8) · from cli**`, `Action: send one model call to gpt-4o via llm.test`, `Target: total`, `Amount: ~$… (this one call's estimate)` and "Approve also needs a one-time code I send you then (SAFE-19)."; Approve alone sends nothing; Approve plus the code DMed apart sends the call once and answers with `SPEND_CARD_APPROVED`; the request ends `used`; `spend-cap-card` `ok` and `spend-cap-approve` `started` then `ok` are on the audit chain.
- Deny on the card: nothing is sent and the card says "Denied by you — nothing was spent."; the run's ask names the denied card.
- Another user's Approve and code submit are answered "Only the owner can answer this card." and nothing is sent.
- A code typed after the card lapsed is a no: nothing is sent and the request is `expired`.
- A pending spend card whose waiting process is gone is closed on the next pass as a no, with no card sent.
- The bridge (fake gateway, owner from the allowlist file) DMs a spend card another process recorded, with its `cvok:spend:approve:<id>` button, and Approve answers with the code step (not "This card is no longer handled.") and DMs an 8-character code.
- These tests fail on main's sources.
- A card whose amount is unknown (SAFE-16.a) answers Approve plus the code with `SPEND_CARD_UNKNOWN_APPROVED` (REQ-discord-199).

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
  `parseAskCustomId`). A `spend-cap` stop SHALL carry **Continue**
  (`SCHEDULE_ASK_CONTINUE_LABEL`, the same `open` custom id) and
  **Cancel** (AUTONOMY-8: continuing past the cap goes through the owner's
  spend card) and its post SHALL stay "💸 Work is paused for budget."
  (SAFE-14.a). The post's hint line
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
  `SCHEDULE_ASK_PAUSED_NOTE`: closing the question does not resume it. On a
  `spend-cap` ask, the live owner's **Continue** (its `open` press) SHALL
  close it `continued` with no answer handed on (so the stop's amounts never
  reach a run's prompt) and ack privately `SCHEDULE_ASK_CONTINUED_ACK` (no
  amount; plus `SCHEDULE_ASK_PAUSED_NOTE` on a paused schedule): the next
  due run goes ahead and any call it makes past a cap, or at an unknown
  price, asks the owner on a spend card with a one-time code first
  (REQ-agent-198, REQ-agent-199). Anyone else's Continue — the creator's
  included, since only the owner approves spend — and a pick or a form
  submit on a `spend-cap` ask SHALL be refused like someone else's press;
  Cancel stays open to the creator and the owner. Closing is a compare-and-set on `ask_closed_at IS
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
  later run gets it again. A cancelled or continued ask hands nothing on.
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
- Listed choices post Choose + Cancel (`cvask:open:srun_…`, `cvask:cancel:srun_…`) with `SCHEDULE_ASK_CHOOSE_HINT`; free text Answer + Cancel with `SCHEDULE_ASK_ANSWER_HINT`; neither carries the reply hint; a spend-cap stop Continue + Cancel (its note too), its post only "💸 Work is paused for budget." and its note no amount.
- An in-process ask post that resolves `false` is posted, with its controls, by the next tick.
- A schedule with no channel DMs the ask with its controls and the one note (with the same controls) to the owner and posts nothing in a channel; with no owner nothing is sent and the ask stays pending.
- The owner's pick reaches the next run unfenced and only that run; the creator's typed answer is stored scrubbed and reaches the next run fenced (`role: community`); a closed ask cannot be closed again.
- Through `startBridge` with a memory DB and fake interactions: Choose shows the creator the choices privately and a pick closes the ask `picked` (a re-press is "isn't for you"); an unknown option id is `ASK_CHOICE_EXPIRED`; Answer opens the form, a thin submit restates privately with Cancel and keeps it open, a typed submit closes it `answered` with the secret redacted, `cancel` typed cancels; someone else's Cancel or submit is refused and the ask stays open, the owner's and the creator's Cancel close it; a spend-cap ask refuses the creator's Continue and a submit, takes the owner's Continue (closed `continued`, no answer, nothing handed to the next run, the ack naming no amount) and the creator's Cancel; an ask three days old still takes a pick; a press outside the allowlisted channel, or once the schedule's channel left the allowlist, gets the zero-width ack (the tip for the owner); a deny-listed creator gets the zero-width ack and a muted one `MUTED`; a channel-less schedule's ask is answered in the owner's DM and refused from a guild channel; the creator's injection-like typed answer closes nothing and pings the owner in the schedule's channel; a Cancel id on a session ask is refused; on a paused schedule the ack of a Cancel, a typed answer or a pick ends with `SCHEDULE_ASK_PAUSED_NOTE`, on an active one it does not.
- Through the bridge's own scheduler: the ask post carries Choose + Cancel, a channel reply to it leaves it open and the creator's Cancel closes it; a channel-less schedule DMs its ask and controls to the owner.
- A v14 DB migrates to v15: the eight columns exist; asks recorded before that were posted, or are moot, are closed `superseded`, are neither open nor pending and are not posted again, and that schedule's next due run goes; a still-pending ask on its schedule's newest run becomes open and blocking, its schedule's next due run waits and that ask is posted with Answer + Cancel, then the one note; a re-run changes nothing; `ask_answer` and `ask_options` are re-scrubbed.
