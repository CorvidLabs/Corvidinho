---
module: discord
change: only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14
---

# Delta: discord (only the owner sees spend amounts and cap settings; everyone else sees "Work is paused for budget.", SAFE-14.a)

## Modified

### REQUIREMENT REQ-discord-098

The shared SQLite store SHALL treat the module-owned `spend_ledger` and
`spend_alerts` tables (created by `src/agent/spend.ts` and
`src/agent/spend-alerts.ts` with CREATE TABLE IF NOT EXISTS, no schema
version bump) like every other persisted table under SAFE-6: the free-text
`provider` and `model` columns of `spend_ledger` SHALL be written through
`scrubSecrets` and SHALL be listed in `SCRUB_TARGETS`, so a scrub-rules
re-scrub also covers them; `spend_alerts` SHALL hold no free text.

On Discord (SAFE-8 as amended on #98, AUTONOMOUS-8, SAFE-14.a), a run that stopped at
the spend cap (`ask.reason` `spend-cap`) SHALL be posted through the
AUTONOMY-1/2 ask path on every bridge surface — chat reply, `/work`,
`/session start` and schedule post — with a paused, not failed, status and
without the "reply to answer" hint (a reply cannot lift the cap). Like a
stuck ask (AUTONOMY-2/4), a spend-cap ask SHALL ping the configured owner,
once per cap episode across those surfaces (the bridge's spend alert outbox
`claimCapPing`; a schedule also keeps its per-schedule ping key); later
spend-cap asks in the same episode SHALL post without a ping. A spend-cap
stop SHALL NOT be kept as the session's pending ask (AUTONOMY-5/6; a reply
cannot lift the cap): a later thin reply runs the agent like any other
message, a substantive reply carries no cap text into the prompt, and a
spend-cap pending ask persisted by an earlier build SHALL load as none;
clarify and stuck pending asks are unchanged. `/work` SHALL record a run
that stopped to ask as `blocked` (not `completed`; a stuck run stays
`failed`), SHALL say only that the PR was not opened because work is paused
for budget, and `/status` SHALL count blocked work as waiting for input.
`/work` and `/session start` SHALL answer with the ask content in the one
message DISCORD-ASK-7 leaves (the thinking message edited into the answer
and the deferred reply deleted, else the status plus the reply), SHALL
address the requester on a clarify ask (AUTONOMY-4) and ping the owner only
for stuck and spend-cap asks; a run that stopped to ask SHALL never show "✅
Done" (the fallback status is the ask's). That owner ping SHALL go out as a
fresh channel post after the answer (allowed mentions
limited to the owner; an edit does not notify a mention), or be appended to
the answer that went out (the collapsed message edited again, or the reply)
when that post cannot be sent; when the answer itself fails (e.g. an
interaction token that expired during a long run) the notice SHALL still go
out as the fresh channel post and the answer's error SHALL still be raised.

The 80% warning SHALL reach the owner even when the run that crossed it had
no Discord reply (WATCH, the headless daemon, a delegate worker, a schedule
whose channel left the allowlist): after each chat, button-pick, `/work` and
`/session start` run and on every scheduler tick the bridge SHALL take the
pending warning from the outbox over the bridge's shared DB (the run's own
`spendWarning`, validated by `spendWarningFromUnknown`, only when the bridge
has no DB) and send the warning line built from integer amounts to the
configured owner by DM only (SAFE-14.a); a DM that did not go out SHALL hand
the warning back for the next pass. A post that did not go out (a chat
reply, a schedule post, or a slash run's owner notice that went out neither
as a channel post nor in the reply) SHALL hand back the cap episode's owner
ping for the next post, and a schedule SHALL keep no ping key for a ping that
was never posted. `/status` SHALL show the owner the rolling 24-hour spend
against the cap with the percent, or that no cap is set, from the bridge's
shared DB, with no new slash command.

Only the owner SHALL see spend amounts and cap settings; everyone else SHALL
only see that work is paused for budget (SAFE-14.a):

- Every Discord post about a spend-cap stop — the chat answer, the answer to
  a run a button pick resumed, the `/work` and `/session start` answers, a
  schedule run's own ask post and the ask a bridge tick posts for a daemon
  run (REQ-discord-347) — SHALL be `formatAskReply` with `SPEND_CAP_HEADLINE`
  "💸 Work is paused for budget." (`SPEND_PAUSED_TEXT`), the owner mention
  (once per cap episode) and the schedule line on a schedule post, and SHALL
  NOT quote the ask's question. `SPEND_CAP_STATUS` SHALL be "💸 Work is paused
  for budget", the `/work` PR line "PR: not opened — Work is paused for
  budget." and a slash owner notice's spend-cap line "💸 <@owner> <label>:
  Work is paused for budget.". No channel post (answer, split part, collapsed
  edit, fallback reply, slash owner notice, schedule post) SHALL carry the 80%
  warning, an amount, a cap value or a setting name.
- The owner SHALL get a cap stop's details — the spend-cap question with the
  24-hour spend, the call's estimate, the cap and the setting to change,
  scrubbed (SAFE-6) and mention-defanged, naming the channel — by DM through
  the gateway `sendDm` (`src/discord/spend-dm.ts`), once per cap episode:
  when the stop's post claimed the episode's owner ping (`claimCapPing`), also
  when that post then failed; a schedule run's ask that the bridge retries
  every tick because its post keeps failing (its cap ping handed back each
  time) SHALL hand its details to the DM once per run, not on every tick.
  A stop DM that does not go out SHALL be held in
  memory (a newer stop replacing it) and retried with the warning on the next
  pass; one pass SHALL run at a time. A failed DM SHALL be logged once per
  failure streak, with no amounts. With no owner configured nothing is
  claimed or sent; with no DM path yet nothing is claimed.
- `/status` SHALL show the spend line only to the owner (ADMIN, IDENTITY-2,
  re-checked by the handler), with a note while a spend DM waits; anyone else
  SHALL see no spend line, and "Spend: Work is paused for budget." while runs
  stop at the spend check (cap reached, unpriced model, invalid value,
  unreadable ledger).
- The owner's answer footers keep tokens and cost and everyone else's show
  model and time (DISCORD-15.a, REQ-discord-457, unchanged). `corvidinho
  doctor`, `task run` output and the daemon's logs stay the operator's.
- No new env var, config key, table, column or schema version.

Acceptance Criteria
- A ledger row written with a vendor-key-looking provider or model persists redacted.
- `SCRUB_TARGETS` contains `spend_ledger` with `provider` and `model`.
- `rescrubDatabase` re-scrubs a raw `spend_ledger` row.
- A `spend-cap` ask reply is the spend-cap headline "💸 Work is paused for budget." without the question, pings the owner, its thinking status ("💸 Work is paused for budget") is not an error, and it never carries the reply hint.
- Two spend-cap asks with different amounts share one `askPingKey`.
- Two chat messages at the cap: the first reply pings the owner, the second posts the ask with no mention; after spend is seen under 70% the next one pings again. A spend-cap stop leaves no pending ask: a later `ok` runs the agent (still at the cap: the ask again, no mention) and a substantive reply's prompt carries no prior-question or cap text; a stored spend-cap pending ask loads as none while a stored clarify ask loads unchanged.
- `/work` with a clarify ask is `blocked`, mentions the requester in the reply and posts no owner notice.
- `/work` at the cap: the task is `blocked`, the reply shows the spend-cap headline and the PR line "PR: not opened — Work is paused for budget." (no ✅, no question, no amount), and one fresh post "💸 <@owner> /work `…`: Work is paused for budget." pings the owner; a second `/work` in the same episode does not ping. `/session start` at the cap shows the headline and pings the owner.
- A schedule spend-cap ask in an episode already pinged elsewhere posts without a mention.
- A warning recorded by another process (a WATCH-style run on the same data dir) reaches the owner by DM after the next bridge chat run, once, and the reply is the plain answer; `/work` DMs a pending warning to the owner and posts nothing more.
- A result with `spendWarning` and no bridge DB is DMed to the owner (chat reply and schedule run) and the post carries no warning line and no owner mention; a malformed `spendWarning` in the result frame is dropped.
- `/status` with a $5 cap and $4.10 spent shows the owner `Spend (24h): $4.10 of $5.00 daily cap (82%)`.
- `/work` whose final reply throws (expired interaction token) still posts the owner notice with the spend-cap ping, the owner gets the details and the pending warning by DM, and the error is raised; `/session start` whose reply and notice both fail still DMs both at once and leaves the cap ping for the next chat reply, which pings the owner.
- A chat spend-cap reply that failed to post leaves the episode's owner ping for the next reply.
- A schedule spend-cap post that failed sets no ping key, and the next tick's post pings the owner.
- `/work` at the cap with an editable thinking message: the thinking message becomes the answer (`(blocked)`, the spend-cap headline, no ✅, no mention), the deferred reply is deleted, and one fresh post pings the owner without the warning (DMed); a second `/work` in the episode posts no owner notice.
- `/session start` with a stuck ask collapses to the ask (no ✅) and the owner gets a fresh post; with a clarify ask the collapsed answer mentions only the requester and no owner post goes out.
- The fresh owner post fails: the notice is appended to the collapsed answer (same message edited again, owner in its allowed mentions).
- Collapse, reply and owner post all fail (reply throws): the error is raised, the warning was DMed at once and the next chat answer carries the owner ping.
- SAFE-14.a through `startBridge` with a memory DB (replies and DMs recorded) and a bridge-wired scheduler: no post about a spend-cap stop (chat fallback reply, collapsed edit, button-pick resume, `/work`, `/session start`, schedule post, daemon pending-ask post) carries the question, a `$` amount, a percent, `CORVIDINHO_`, "daily cap" or "SAFE-8"; the owner gets one DM with the details ("💸 Work is paused for budget. Only you see these details (SAFE-14.a).", the channel, the quoted question) per cap episode, and again after a re-arm or a handed-back ping; a chat answer, a split fallback answer, a collapsed edit and a schedule ✅ post with an 80% warning pending are the plain answer with no owner mention, and the owner gets the warning by DM once.
- SAFE-14.a `/status`: the owner sees the 24 h spend line (82%, then 102% "cap reached") and "Spend cap: off (set CORVIDINHO_DAILY_SPEND_CAP_USD …)" with no cap; a declared team member sees no spend line under the cap or with none set, and "Spend: Work is paused for budget." at the cap.
- SAFE-14.a `createSpendDm`: a DM that returns null or throws keeps its claim (the warning pending in `spend_alerts`, the stop held) and is sent on the next pass, once; the failure is logged once per streak with no amounts; a newer stop replaces a held one; no owner or no DM path claims nothing; concurrent passes send a held stop once.
- DISCORD-15.a unchanged: someone else's answer footer shows model and time only; the owner's shows tokens and cost.
- These SAFE-14.a tests fail on the base sources.

### REQUIREMENT REQ-discord-215

Discord does not notify a mention added by a message edit. Whenever the
bridge delivers an answer by editing the thinking (or Choose stub) message
(DISCORD-ASK-6/7: the chat answer, the answer to a run a button pick resumed,
`/work` and `/session start`) and that answer mentions the requester (a
clarify ask, AUTONOMY-4) and/or the configured owner (a stuck ask,
AUTONOMY-2; a spend-cap ask, SAFE-8; a SAFE-13 owner line), the bridge SHALL
additionally send one short fresh post to the same channel, replying to the
edited answer, whose content is only those mentions with a one-line pointer
(`↑ question for you` for the requester the clarify ask addresses, `↑ needs
you` for everyone else) and whose allowed mentions are exactly those users
(no `@everyone`, `@here` or roles). The bridge SHALL NOT ping a user twice in
one turn: a user a fresh post already pinged (the slash owner notice of
REQ-discord-098) is left out, and the spend cap's once-per-episode owner ping
(`claimCapPing`) still applies, so a spend-cap ask whose episode already
pinged adds no owner ping. When the answer went out as a fresh reply (the
fallback when the edit is unavailable or fails) or mentions nobody, no extra
post SHALL be sent. A chat or button-pick ping post SHALL be tracked like the
answer, so replying to it continues the session (DISCORD-2). The ping is best
effort: a failed or throwing post SHALL NOT fail the turn or undo the
answer. The one-message layout of DISCORD-ASK-6/7 is otherwise unchanged; no
slash command, env var or schema change.

Acceptance Criteria
- A chat clarify ask collapsed into the thinking message (free text or Choose stub) is followed by exactly one fresh post, `<@requester> ↑ question for you`, replying to the edited answer, with allowed mentions exactly the requester; a reply to that post continues the session.
- A chat stuck ask collapsed into the thinking message is followed by exactly one fresh post, `<@owner> ↑ needs you`, with allowed mentions exactly the owner (the requester is not pinged).
- A collapsed clarify ask with a pending 80% warning carries no warning line and is followed by one post pinging only the requester (question); the owner gets the warning by DM (SAFE-14.a, REQ-discord-098).
- Two chat spend-cap stops in one cap episode produce one owner ping post in total.
- A collapsed answer that mentions nobody, an answer delivered as a fallback reply, and a failed ping post add no post; the turn still finishes.
- A button pick whose resumed run gets stuck collapses the stub into the ask and is followed by one owner ping replying to the stub.
- `/work` with a clarify ask collapses the answer, deletes the deferred reply and is followed by one requester ping, with no owner notice.
- `/work` at the spend cap with a pending warning sends exactly one owner post (the REQ-discord-098 notice, without the warning) and no duplicate ping; `/session start` with a clarify ask by the owner and a pending warning sends no owner notice, only the question's ping (the warning goes by DM).
- When the slash owner notice post fails and is appended to the collapsed answer, one owner ping post follows.
- A slash answer delivered through the deferred reply (no collapse) adds no ping post.

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

No new slash command, env var or channel; the only DM is the owner's spend
DM (SAFE-14.a, REQ-discord-098).

Acceptance Criteria
- A daemon-wired scheduler's stuck run stores `ask_reason` `stuck` and the question with `ask_posted_at` null and posts nothing; a bridge-wired scheduler on the same DB posts it on its next tick once, to the schedule channel, with the prefix, the stuck headline, the question and the owner mention (`mentionUserIds` [owner]); later ticks post nothing more.
- A daemon clarify ask posts with only the schedule creator mentioned.
- A daemon spend-cap ask posts the schedule line and "💸 Work is paused for budget." with the owner pinged, no question, no warning and no reply hint, and hands the stored question to the owner's DM pass once; a second one in the same episode posts without a ping or DM; an episode another surface already pinged posts without a ping; one whose channel post fails on three ticks (retried each tick, its cap ping handed back) DMs the owner its details once, and posts with the ping once the channel works.
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

### REQUIREMENT REQ-discord-734

A run summary that ends with the ROLES-CHAT-3 closing note
`\n\n(not allowed for your role)` (REQ-agent-333) SHALL keep that note
through every cap it meets after `chatBodyFromTaskResult` on its way to a
Discord post. Each such cap SHALL use `clipKeepingRoleNote`
(`src/agent/task-summary.ts`): the text before the note loses its end and
the note stays last.

- A scheduled run's summary SHALL be capped at `POST_SUMMARY_MAX` (1500
  chars) for the run row's `summary` and for the `✅` / `❌` schedule post,
  and in the post also at what fits after the post's head within
  `ASK_REPLY_MAX` (1900), so the gateway's 1900 cut never reaches it.
- The `/work` and `/session start` answers SHALL cap the summary at 1500
  chars and at what fits after the answer's head (task, session, worktree,
  description and PR lines; session, topic and worktree lines) within 1900,
  so the gateway's 1900 cut never drops the note.
- `appendPostLine`, which cuts a post's body so an appended line fits within
  1900 (a SAFE-13 owner line on a reply or schedule post, a slash owner
  notice that rides the answer; the SAFE-8 80% warning no longer rides a
  post, SAFE-14.a), SHALL cut the body before the note, end the kept text in
  `…`, and keep the note ahead of the appended line.

`ask-ping.ts` SHALL export `POST_SUMMARY_MAX` and
`clipPostSummary(summary, headLength = 0)` for these caps. A summary that
does not end with the note SHALL be capped exactly as before. An ask's post
(a question or Choose stub, including a stuck ask's 400-char context) is not
changed. No env var, config key, flag, slash command, table or schema change.

Acceptance Criteria
- `tests/scheduler.service.test.ts` "a long summary ending with the note keeps it in the run row and the post; one without is cut as before": the run row's summary is 1500 chars ending with the note; the post (448-char schedule name) is at most 1900 chars and ends with the note; a run without the note stores and posts exactly its first 1500 chars.
- `tests/discord.slash-ask7.test.ts` "/work answer for a non-owner keeps the closing role note within the 1900 cap": the collapsed answer is at most 1900 chars, its summary part is under 1500 (fitted after a long head) and it ends with the note.
- Same file, "/session start answer for a non-owner keeps the closing role note within the 1900 cap": at most 1900 chars, the summary part at most 1500, ending with the note.
- `tests/discord.spend.test.ts` "the cut for an appended line keeps a closing role note": an 1800-char body ending with the note plus a ~210-char owner notice line is a 1900-char post ending `y…`, the note, a blank line and the line; a body that fits is untouched; a long body without the note still ends `…\n\nLINE`.
- With main's `src/discord/ask-ping.ts`, `src/discord/command-handlers/work.ts`, `src/discord/command-handlers/session.ts` and `src/scheduler/service.ts`, these four tests fail; they pass on the branch.

### REQUIREMENT REQ-discord-071

Untrusted text on Discord (SAFE-11 / SAFE-12 / SAFE-13, #71). The IDENTITY-4
acting-user block SHALL show the acting user's Discord display name or
username only after `cleanDisplayName` (`cleanedDiscordName`; the declared
person's display and the owner map display are the owner's own and shown as
configured), and SHALL add one `name_clash` line when that shown Discord name
reads like the owner's display or another declared person's display or
nickname (`displayNameClash`, `namesLookAlike`); who the user is and their
role come only from the Discord user id (IDENTITY-7 / IDENTITY-12). Chat
messages, `/session start`, `/work` and an answer typed in an ask's private
Answer form (REQ-discord-548) SHALL resolve the speaker's role
(`resolveDiscordActingRole`) before the run. For team and community speakers
(never the owner) `inboundInjection` SHALL scan the speaker's own words; a hit
SHALL start no run: on chat one public reply to the message
(`formatInjectionRefusal`: what it won't do and why in plain words, never the
text, pinging the owner with allowed mentions limited to the owner; without an
owner it says nobody could be told and logs `INJECTION_NO_OWNER_WARNING`), a
session the message started is ended and the turn is not recorded; on slash
(`refuseInjectedSlash`) the interaction gets the public refusal and the owner a
fresh channel post that pings only them, and no session, worktree or work task
is created; on the Answer form (`refuseInjectedAnswer`) as the same words in a
chat reply in that session: the ask stays pending and the session live, the
submit gets an ephemeral refusal (never the text) and the owner one fresh post
in the session's channel, replying to the ask's stub, that pings only them and
is tracked on the session as a chat refusal is; every way one
`injection-suspected` / `denied` SAFE-5 row is appended through the bridge's
trail (actor, surface `discord:<session>` for chat and the Answer form or
`discord:/<command>`, digest of the source and reason ids; best effort).
Otherwise a team / community speaker's words SHALL reach the model through
`fenceSpeakerText` (the `UNTRUSTED_DATA` fence with a header naming their role
and saying it is their request but data, not instructions; source
`chat-message`, `session-topic`, `work-task` or `ask-answer`); the owner's
words are unchanged. A team / community presser's button pick SHALL reach the
model the same way: its option label (written by the model, but possibly copied
from their own words) goes through `fenceSpeakerText` with source `ask-pick`
and their role resolved at press time with their Discord role ids (SAFE-12.a,
REQ-discord-548); it is fenced, not scanned, and the owner's pick is unchanged.
A pick whose option id matches none of the ask's options SHALL get
`ASK_CHOICE_EXPIRED` and never reach a run. The spawn client SHALL read the child's `result.injection`
with `injectionNoticeFromUnknown` into `AgentSpawnResult.injection`, and the
post that carries a run's answer SHALL then ping the owner with
`formatInjectionOwnerLine`: chat and button-pick replies (`withInjectionNotice`;
the SAFE-8 warning no longer rides a post, SAFE-14.a), `/session start` and `/work` (`slashOwnerNotice`
`injection`) and a schedule run's result post or ask post. Replayed session
turns SHALL strip invisible characters and mark a line that imitates a
Corvidinho block or a turn label (`Human:`, `You (Corvidinho):`) `(quoted)`,
so an earlier message cannot close the replay block or pass for a turn of
Corvidinho's own; recalled
memory lines SHALL strip invisible characters. `discord-user-lookup` names are
cleaned (REQ-plugins-071). No env var, config key, table or column.

Acceptance Criteria
- Through `startBridge` with a memory DB: a stranger's injection starts no run, gets one reply to the message that pings only the owner, ends the session it started and appends one `injection-suspected` / `denied` row with the stranger as actor; a declared team member's injection is refused too; the owner's own words run unfenced.
- An ordinary stranger message runs with the words inside the fence (`role: community`, `source=chat-message`), the display name cleaned and a `name_clash` line; a run reporting `injection` gets the owner line and the owner in its allowed mentions.
- `/session start` and `/work`: a stranger's injection creates no session and runs nothing, the interaction gets the refusal, the owner a fresh ping post, the trail one `denied` row; an ordinary stranger request runs fenced and the owner's unfenced.
- `slashOwnerNotice` and `withInjectionNotice` carry the SAFE-13 owner line and the owner mention; no notice leaves a post unchanged.
- The replay block marks a turn line that imitates its footer or a turn label `(quoted)` and still ends with its own footer.
- A schedule run reporting `injection` pings the owner with the SAFE-13 line on its result post and, when it ends with an ask, on its ask post.
- A non-owner's free-text answer to a pending ask reaches the model inside the fence (`tests/discord.slash-pending-ask.test.ts`).
- The private Answer form: a community user's and a declared team member's injected submit starts no run, gets an ephemeral refusal, keeps the ask and the session, pings only the owner once in a post replying to the stub and appends one `denied` row with surface `discord:<session>`; an ordinary community answer runs inside the fence (`source=ask-answer`); the owner's answer runs unfenced and unscanned (`tests/safe.injection.test.ts`, `tests/discord.ask-answer-modal.test.ts`).
- A Choose pick: a community user's and a declared team member's picked label reaches the run inside the fence (`source=ask-pick`, their role; also for a team member allowlisted only by a Discord role), with no scan, refusal or audit row; the owner's pick is unchanged; a forged or unmatched option id gets `ASK_CHOICE_EXPIRED`, runs nothing and never reaches a prompt raw.
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.
