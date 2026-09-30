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
