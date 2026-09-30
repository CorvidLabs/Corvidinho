---
module: discord
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
---

# Delta: discord (each spend cap pings, warns and shows on its own for the owner only; spend_alerts.scope scrubbed, SAFE-14 / SAFE-15)

## Modified

### REQUIREMENT REQ-discord-098

The shared SQLite store SHALL treat the module-owned `spend_ledger` and
`spend_alerts` tables (created by `src/agent/spend.ts` and
`src/agent/spend-alerts.ts` with CREATE TABLE IF NOT EXISTS, no schema
version bump) like every other persisted table under SAFE-6: the free-text
`provider` and `model` columns of `spend_ledger` SHALL be written through
`scrubSecrets` and SHALL be listed in `SCRUB_TARGETS`, so a scrub-rules
re-scrub also covers them; `spend_alerts` SHALL hold no free text but its
cap `scope` (`total` or `provider:<id>`, SAFE-14; added in place by an
idempotent ALTER, older rows `total`), which SHALL be written through
`scrubSecrets` and listed in `SCRUB_TARGETS`. A re-scrub SHALL skip a listed
column a module-owned table does not have yet (a `spend_alerts` created by an
older build, before its module adds `scope`) instead of failing the open.

On Discord (SAFE-8 as amended on #98, AUTONOMOUS-8, SAFE-14.a), a run that stopped at
the spend cap (`ask.reason` `spend-cap`) SHALL be posted through the
AUTONOMY-1/2 ask path on every bridge surface — chat reply, `/work`,
`/session start` and schedule post — with a paused, not failed, status and
without the "reply to answer" hint (a reply cannot lift the cap). Like a
stuck ask (AUTONOMY-2/4), a spend-cap ask SHALL ping the configured owner,
once per cap episode across those surfaces (the bridge's spend alert outbox
`claimCapPing`; a schedule also keeps its per-schedule ping key); later
spend-cap asks in the same episode SHALL post without a ping. Episodes SHALL
be kept per cap (SAFE-15, REQ-agent-114): a stop pings once per episode of
each cap it stopped at (`spendScopesOf`: the ask's `spendScopes`, else the
"Stopped at cap" marker of a question stored as text), so a stop at another
provider's cap or at the total cap pings again, and a schedule's ping key for
a spend-cap ask SHALL follow the provider caps it stopped at (the total cap
alone keys as before). A spend-cap
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
configured owner by DM only (SAFE-14.a), one line per cap that crossed 80%
(the total cap, and each provider cap named by its scope); a DM that did not
go out SHALL hand the warning(s) back for the next pass. A post that did not go out (a chat
reply, a schedule post, or a slash run's owner notice that went out neither
as a channel post nor in the reply) SHALL hand back the cap episode's owner
ping for the next post, and a schedule SHALL keep no ping key for a ping that
was never posted. `/status` SHALL show the owner the rolling 24-hour spend
against the cap with the percent, or that no cap is set, and one line per
provider cap (that provider's spend against its cap), from the bridge's
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
  stop at the spend check (any cap reached, the total or a provider's,
  unpriced model, invalid value, unreadable ledger) — never which cap.
- The owner's answer footers keep tokens and cost and everyone else's show
  model and time (DISCORD-15.a, REQ-discord-457, unchanged). `corvidinho
  doctor`, `task run` output and the daemon's logs stay the operator's.
- No new table, slash command or schema version; the env var
  (`CORVIDINHO_PROVIDER_SPEND_CAPS_USD`) is REQ-agent-114's and the
  `spend_alerts.scope` column is added in place.

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
- SAFE-14 / SAFE-15 per cap: `SCRUB_TARGETS` lists `spend_alerts.scope`, a secret-shaped provider id is stored and re-scrubbed redacted, and a re-scrub over a `spend_alerts` without `scope` does not throw; `askPingOwner` pings once per episode of each cap (another provider's stop and the total's each ping; a released claim pings again; a stored question-only stop claims its own caps); the owner's DM carries one warning line per cap; the owner's `/status` lines list each provider cap; the public spend-cap post names no scope, provider, amount or setting.
