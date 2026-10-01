---
module: discord
change: a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told
---

# Delta: discord (a failed run says why to the owner, and that the owner was told to anyone else — DISCORD-3.b)

## Added

### REQUIREMENT REQ-discord-032

When a run fails, my own runs tell me why in one plain line; everyone else
gets 'That didn't work — the owner has been told.', and the reason is always
logged (DISCORD-3.b, captured with `hi` in this change from Leif's
2026-09-30 decision, interview round 15). Every Discord surface that posts a
failed run's answer — a chat message, an ask pick or Answer form resuming a
talk, `/session start`, `/work` and a schedule's result post — SHALL build
it with `failedRunOutcome` / `failedRunReply`
(`src/discord/failure-reason.ts`) wherever it posted `session <id> failed
(exit N)` / `failed (exit N)` (a failed run with no question to ask, not
stopped) and wherever a run that threw posted its raw message. The reason
SHALL be `failureReasonFor`: the result frame's `error` (REQ-agent-032),
else the run tier's no-provider notice (AGENT-10), else the last meaningful
line of the child's stderr, else the exit code — never the run's summary or
a tool's output (SAFE-12/13, AGENT-9). It SHALL be secret-scrubbed first
(SAFE-6), with ANSI codes, stack frames, source excerpts and runtime banners
dropped and host paths cut to their last segment, then cut to one line of at
most `FAILURE_REASON_MAX` (200) characters. Every failure SHALL log one line
`[discord] run failed (<surface>, exit N): <reason>` (`[scheduler]` and
`schedule <id>` for a schedule). The owner's own run (the DISCORD-15.a
`isOwnerDiscord` check; for a schedule, the live owner's own schedule)
SHALL answer with the reason. Anyone else's SHALL answer
`FAILED_TOLD_OWNER_TEXT` only when the owner has been told: the bridge's one
`createFailureOwnerDm` (on the gateway `sendDm`, shared by chat, the slash
context and the bridge's scheduler) DMs the owner `❌ A run failed (<surface>
in <#channel>): <reason>`, at most once per reason per
`FAILURE_DM_DEDUP_MS` (1 hour); otherwise (no owner, no DM path, the daemon,
a DM that did not go out — which is not remembered) it SHALL answer
`FAILED_TEXT` and never claim the owner was told. The reply carries no spend
amounts (SAFE-14.a); the `state=` / `verified=` / `attempts=` plumbing stays
in the embed footer (DISCORD-3.a). A schedule run's row keeps the posted line
as its `summary` and `failed (exit N): <reason>` as its `error`. Asks,
stops and spend-cap stops are unchanged. No env var, config key, slash
command or schema version is added.

Acceptance Criteria
- The owner's failed chat, ask-pick, `/session start`, `/work` and own-schedule answers are the one reason line; the footer still carries the plumbing and the body never does.
- A team member's failed run answers `That didn't work — the owner has been told.` and the owner gets exactly one DM per reason per hour naming the surface and channel; with the DM failing, no owner or no DM path the answer is `That didn't work.`.
- A key and a multi-line stack in stderr reach the owner as one scrubbed line with no host path; with no provider the owner sees the AGENT-10 notice.
- Every failure logs `[discord] run failed (<surface>, exit N): <reason>` (`[scheduler] run failed (schedule <id>, exit N): …`).

## Modified

### REQUIREMENT REQ-discord-079

With no provider set, it says so at startup and in /status (AGENT-10,
captured from Leif's 2026-09-28 interview). The Discord bridge SHALL log one
`[discord] <notice>` line with `console.warn` at start (after the audit
line) when any tier has no usable model provider
(`providerNotice(env)`, REQ-agent-179) and nothing when every tier has one.
Runs it starts on such a tier (chat, button answers, `/session start`,
`/work`, schedules) fail and call no model (REQ-agent-179): the run's result
summary and `error` are the notice, while the channel gets the DISCORD-3.b
failed reply like any failed run (REQ-discord-032): the owner's own run
answers with the notice cut to one line, anyone else's with `That didn't
work — the owner has been told.` (the owner DMed that line) or `That didn't
work.`; the start-up line and `/status` say why too. No new slash command,
setting or schema change.

Acceptance Criteria
- A dry-run bridge started with no model logs `[discord] No model provider is configured: CORVIDINHO_LLM_MODEL is not set. …` once; with `CORVIDINHO_LLM_MODEL=ollama:qwen3` it logs no no-provider line.
- With no model, the owner's own failed chat run answers `No model provider is configured: …` as its one line (REQ-discord-032).

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
