# Lesson bundle — only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Only the owner sees spend amounts and cap settings on Discord; everyone else sees only 'Work is paused for budget.' (SAFE-14.a): spend-cap posts, the /work PR line, the slash owner notice and SPEND_CAP_SUMMARY say only that; the question quote is dropped on every path including the daemon pending-ask pass; the 80% warning never rides a channel post and, with a cap stop's details, goes to the owner by DM (src/discord/spend-dm.ts, retried every scheduler tick); the /status spend line is owner-only
- **Kind**: Feature
- **Specs**: discord, agent
- **Paths**: src/discord/spend-dm.ts, src/discord/ask-ping.ts, src/discord/spend-post.ts, src/discord/bridge.ts, src/discord/slash-types.ts, src/discord/command-handlers/status.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, src/scheduler/service.ts, src/agent/spend-notice.ts, src/agent/spend-outbox.ts, src/agent/spend-alerts.ts, src/agent/index.ts, tests/discord.spend-dm.test.ts, tests/discord.spend.test.ts, tests/discord.rich-replies.test.ts, tests/discord.collapsed-ping.test.ts, tests/discord.slash-pending-ask.test.ts, tests/scheduler.ask-outbox.test.ts, tests/docs.operator-facts.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/DAEMON.md, docs/BOX-UPDATE.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/discord/requirements.md, specs/agent/agent.spec.md, specs/agent/testing.md, specs/agent/requirements.md
- **Acceptance**: Through startBridge with a memory DB, the fake gateway recording replies and DMs: a spend-cap stop on chat, a button-pick resume, /work, /session start, a schedule run's own post and the bridge tick's daemon pending-ask pass posts only '💸 Work is paused for budget.' (plus the schedule line on a schedule post and the owner mention once per cap episode) — no question quote, no amount, no cap value, no setting name, no reply hint; the /work PR line reads 'PR: not opened — Work is paused for budget.' and the slash owner notice '💸 <@owner> <label>: Work is paused for budget.'; SPEND_CAP_SUMMARY and SPEND_CAP_STATUS carry the same generic text. The owner gets the stop's details (the spend-cap question with spend, estimate, cap and the setting) by DM once per cap episode, with the channel ping, and the 80% warning by DM only — never in a chat answer, a split answer part, a collapsed edit, a fallback reply, a slash owner notice or a schedule post — taken from the outbox once, after each bridge run and on every scheduler tick; a DM that does not go out keeps its claim, is retried on the next pass and is logged once per failure streak with no amounts. /status shows the owner the 24 h spend line (plus a note while a spend DM waits); anyone else sees no spend line, and only 'Spend: Work is paused for budget.' while runs stop at the cap. DISCORD-15.a is unchanged: someone else's answer footer shows model and time only, the owner's footer keeps tokens and cost. The flipped and new tests fail on main's sources and pass on the branch; no env var, config key, table, column or schema version.

## Evidence

- Verification commit: `02faedc2c1341656ffe775b9697e0ab726accfeb`
- Base commit: `f687a5a87d0371d41f8412b96a93dbc917dbbdb4`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Issue #98 (SAFE-8 / SAFE-14..16, M4 "Safe autonomy"). #160 built the daily
spend cap and, as REQ-discord-098 specified then, showed the amounts and the
setting name to whoever asked for the run. The visibility question
(issue #98 comment, 2026-09-26) went to Leif. His answer (interview
2026-09-28, round 4, /home/user/coord/interview-2026-09-28.md): "non-owners
see only 'paused for budget', no amounts or setting names", captured on main
as **SAFE-14.a** "Only I see spend amounts and cap settings; everyone else
only sees that work is paused for budget." Round 9 settled the footer:
"model + time for everyone; tokens + cost only in the owner's runs" —
DISCORD-15.a, already met on main by #297, which this change must not
regress.

Leaks left on main (f687a5a) that this change closes:

- `formatAskReply` quoted the spend-cap question (spend, estimate, cap,
  `CORVIDINHO_DAILY_SPEND_CAP_USD`) in the public post on chat, button picks,
  `/work`, `/session start`, schedule posts and the bridge tick's daemon
  pending-ask pass (`deliverPendingAsks` → `postRunAsk`, from
  `schedule_runs.ask_question`).
- The 80% warning line with amounts (`withSpendWarningPost`,
  `slashOwnerNotice`) rode whichever post went out next, a non-owner's answer
  included.
- `/status` showed the spend line (amounts, or "set
  CORVIDINHO_DAILY_SPEND_CAP_USD") to any allowlisted user.
- The headline, status, slash owner notice, `/work` PR line and
  `SPEND_CAP_SUMMARY` named "the daily spend cap" / "(SAFE-8)".

Out of scope (other slices): per-provider caps and per-scope lines
(spend-caps-b, SAFE-14/15/16), the Approve card for the 100% ask (spend-card,
SAFE-18..20 / AUTONOMY-8), the forget card / approvals engine (another PR in
flight), #232 / #233, and #313 (loop guards; its WATCH stuck-ask DMs change
the scheduler `onTick` line in bridge.ts, so this change hands the spend DM
to the scheduler as its own `spendDm` option instead of touching that line).
No new hi criteria were captured: SAFE-14.a and DISCORD-15.a are already on
main.

## From the change's design.md

# Design

- `src/agent/spend-notice.ts`: `SPEND_PAUSED_TEXT` "Work is paused for
  budget."; `SPEND_CAP_SUMMARY` is that text; `spendPaused(snapshot)` and
  `formatSpendPublicStatusLine(snapshot)` for the public `/status` line (only
  while runs stop at the spend check). Doc comments in `spend-outbox.ts` /
  `spend-alerts.ts` say the bridge delivers by DM; no behaviour change there.
- `src/discord/ask-ping.ts`: `SPEND_CAP_HEADLINE` "💸 Work is paused for
  budget.", `SPEND_CAP_STATUS` "💸 Work is paused for budget";
  `formatAskReply` does not quote a spend-cap ask's question (every caller —
  chat, pick, `/work`, `/session start`, `postOwnRunAsk`, `deliverPendingAsks`
  — goes through it). `formatSpendWarningReply` and `withSpendWarningPost`
  are removed (no caller left).
- `src/discord/spend-post.ts`: `ownerAskNoticeLine` spend-cap line
  "💸 <@owner> <label>: Work is paused for budget."; `slashOwnerNotice` drops
  the `outbox` / `spendWarning` inputs and the warning line. The DISCORD-16
  split and holder-part mention logic (`postAnswerParts`,
  `finishSlashWithOwnerNotice` at `DISCORD_ANSWER_MAX`) are untouched; the
  SAFE-13 line still uses them.
- `src/discord/spend-dm.ts` (new): `createSpendDm({ outbox, owner, sendDm,
  log })` → `deliver({ stop?, warning? })`, one pass at a time, never
  rejects. It DMs the owner the held stop's details (`formatSpendStopDm`:
  head, channel, scrubbed / defanged question) and the warning from
  `takeSpendWarning` (outbox, else the run's own), rebuilt with
  `formatSpendWarningLine`. A failed DM releases the warning to the outbox and
  keeps the stop held (newest wins); failures log once per streak (fixed
  text, no amounts). No owner or no DM path claims nothing.
  `spendStopFor(ask, askOwner, channelId)` hands a stop over only when that
  post claimed the episode's owner ping, so the owner gets one DM per cap
  episode, as one ping.
- `src/discord/bridge.ts`: builds `spendDm` next to the forget cards (same
  `sendDmRef`); the chat and pick paths no longer take the warning and call
  `spendDm.deliver({ stop, warning })` in the post's `finally`;
  `SlashContext.spendDm` and `SchedulerServiceOpts.spendDm`;
  `spendLine(ownerView)` returns the owner line (with a "spend DM waiting"
  note) or the public line.
- `src/discord/command-handlers/status.ts`: re-checks ADMIN
  (`resolvePermissionLevel`, owner-only per IDENTITY-2) and passes it to
  `spendLine`. `work.ts` / `session.ts`: new PR line, notice without the
  warning, DM pass in `finally` (runs even when the interaction expired).
- `src/scheduler/service.ts`: new `spendDm` option (not `onTick`, which #313
  changes); every tick `void spendDm.deliver()`; a run's `deliver({ warning })`
  after its posts; `postRunAsk` hands the stop over when it claimed the ping;
  no `withSpendWarningPost`.
- No env var, config key, table, column or schema version; no /admin knob
  (round 10: spend caps stay env/config).

Design choices pending Leif (conservative defaults from
/home/user/coord/m34-defaults.md, slice spend-caps, where one applies):

1. The owner's own run in a shared channel: the 80% warning goes by DM too,
   never on the owner's answer (default "the warning goes by DM only").
2. DMs closed / failing: the claim is kept and retried every tick, the bridge
   logs once per failure streak, the owner's `/status` spend line says a
   spend DM is waiting, and the channel still gets the generic owner ping for
   cap stops (default). `doctor` shows the past-80% / cap-reached state it
   already showed; no new doctor line (cli module untouched).
3. The cap stop's DM carries the run's own spend-cap question (spend, the
   call's estimate, the cap, the setting), scrubbed and defanged, once per
   cap episode tied to the channel ping; a stop whose DM failed is held in
   memory only (a bridge restart loses it; the owner still has the ping,
   `/status` and doctor). Durable `stop` rows built from integers are
   spend-caps-b.
4. Non-owner `/status`: no spend line at all under the cap; "Spend: Work is
   paused for budget." while runs stop at the spend check — cap reached, an
   unpriced model, an invalid cap value or an unreadable ledger (all stop
   runs); a tier-only unpriced model also shows it.
5. The public wording is exactly "Work is paused for budget." everywhere
   (headline with 💸, status without the period, `/work` PR line, the slash
   owner notice after the label); WATCH comments and `SPEND_CAP_SUMMARY` say
   the same.

## From the change's testing.md

# Testing

Fixture tests only: `startBridge` with a null gateway whose `reply` and
`sendDm` are recorded, in-memory or temp SQLite, fake thinking outbound,
injected agents; no live Discord, no network, no token.

Flipped (they asserted the leaks) — `tests/discord.spend.test.ts`:

- `formatAskReply` on a spend-cap ask is one line, "💸 Work is paused for
  budget." plus the owner mention: no question, `$`, `%`, `CORVIDINHO_`,
  "daily cap" or "SAFE-8"; status "💸 Work is paused for budget".
- Chat spend-cap stop (fallback reply, collapsed edit, edit + reply failing),
  button-pick resume, `/work` (body, PR line "PR: not opened — Work is paused
  for budget.", owner notice "💸 <@owner> /work `…`: Work is paused for
  budget."), `/session start`: no spend detail in any post; the owner gets the
  details by DM once per cap episode (again after a re-arm or a handed-back
  ping), also when the interaction token expired or the post failed.
- 80% warning: a chat answer, a collapsed edit, `/work`, a schedule ✅ post
  and a WATCH-recorded warning carry no warning line and ping nobody; the
  owner gets the warning by DM, once.
- `/status`: the owner sees "Spend (24h): $4.10 of $5.00 daily cap (82%) —
  ⚠️ past 80%", then "$5.10 … (102%) — 🛑 cap reached", and "Spend cap: off
  (set CORVIDINHO_DAILY_SPEND_CAP_USD …)" with no cap; a declared team member
  sees no spend line under the cap or with none set, and "Spend: Work is
  paused for budget." at the cap.
- `appendPostLine` keeps a closing role note ahead of an appended owner
  notice line (REQ-discord-734).

Flipped elsewhere: `tests/discord.rich-replies.test.ts` (a split fallback
answer to someone else with a warning is the answer alone, split as before,
footer model and time only — DISCORD-15.a — and the owner is DMed);
`tests/discord.collapsed-ping.test.ts` (a clarify with a pending warning pings
only the requester; the owner-as-requester clarify gets the question's ping
and a DM; `/work` at the cap: the notice has no warning, two DMs);
`tests/scheduler.ask-outbox.test.ts` (the daemon pending-ask post is the
schedule line and "💸 Work is paused for budget." with the owner ping, no
question or warning; the stored question is handed to the DM pass once per
episode; every tick runs the pass); `tests/discord.slash-pending-ask.test.ts`
(the slash answers at the cap say "Work is paused for budget.", never "Daily
spend cap reached"); `tests/docs.operator-facts.test.ts` (the `/status` row
says the spend line is the owner's).

New — `tests/discord.spend-dm.test.ts`: `SPEND_PAUSED_TEXT` /
`SPEND_CAP_SUMMARY`, `formatSpendPublicStatusLine` / `spendPaused` for every
snapshot kind, `formatSpendStopDm` (head, channel, scrubbed and defanged
question), `spendStopFor`, and `createSpendDm`: the warning DMed once with
current amounts, the run's own warning without a DB, a DM that returns null
or throws keeps its claim and is sent on the next pass, the failure logged
once per streak without amounts, `waiting()`, the newest held stop wins, no
owner / no DM path claims nothing, concurrent passes send a held stop once.

DISCORD-15.a unchanged: the footer tests in `tests/discord.rich-replies.test.ts`
("anyone else's run shows model and time only, never amounts", "the owner's
run shows tokens and the priced cost", "the live status shows token use on
the owner's runs only") pass untouched.

Fail-on-base proof: with `origin/main`'s (f687a5a)
`src/agent/{index,spend-alerts,spend-notice,spend-outbox}.ts`,
`src/discord/{ask-ping,bridge,slash-types,spend-post}.ts`,
`src/discord/command-handlers/{session,status,work}.ts`,
`src/scheduler/service.ts` and `docs/discord.md` swapped in and
`src/discord/spend-dm.ts` removed, 29 tests in the six existing files fail on
their assertions (21 in `discord.spend`, 1 in `discord.rich-replies`, 3 in
`discord.collapsed-ping`, 2 in `discord.slash-pending-ask`, 1 in
`scheduler.ask-outbox`, 1 in `docs.operator-facts`) and
`tests/discord.spend-dm.test.ts` cannot load (the module is new); with the
branch sources restored all tests in the seven files pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-098` | `tests/discord.spend.test.ts`, `tests/discord.spend-dm.test.ts`, `tests/discord.rich-replies.test.ts`, `tests/discord.slash-pending-ask.test.ts`, `tests/docs.operator-facts.test.ts` | Every spend-cap post (chat, pick, `/work`, `/session start`, schedule) says only "💸 Work is paused for budget." with no question or amount; PR line and owner notice generic; the owner gets the stop's details and the 80% warning by DM (once per episode / once per warning, retried after a failure, logged once per streak); `/status` spend line owner-only, "Spend: Work is paused for budget." for others at the cap; DISCORD-15.a footers unchanged. Fails on the base source. |
| `REQ-discord-215` | `tests/discord.collapsed-ping.test.ts`, `tests/discord.spend.test.ts` | A collapsed answer with a pending warning carries no warning and pings only whoever the answer mentions; `/work` at the cap: one owner notice without the warning; owner-as-requester clarify: only the question's ping. Fails on the base source. |
| `REQ-discord-347` | `tests/scheduler.ask-outbox.test.ts` | The daemon spend-cap ask posts the schedule line and "💸 Work is paused for budget." (no question, no warning, no reply hint), pings the owner once per episode and hands the stored question to the owner's DM pass once. Fails on the base source. A daemon spend-cap ask whose channel post fails on three ticks (retried each tick, its cap ping handed back) DMs the owner its details once (review fix: it DMed on every tick). |
| `REQ-discord-734` | `tests/discord.spend.test.ts` | "the cut for an appended line keeps a closing role note": 1900-char post ending `y…`, the note and the appended owner notice line; a body that fits is untouched. |
| `REQ-discord-071` | `tests/discord.rich-replies.test.ts`, `tests/safe.injection.test.ts` | The SAFE-13 line still rides the answer and pings the owner on the part that holds it (split semantics unchanged); no SAFE-8 warning shares the post. |
| `REQ-agent-098` | `tests/discord.spend-dm.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.spend.test.ts` | `SPEND_CAP_SUMMARY` is "Work is paused for budget." (no `$`, no `CORVIDINHO_`); `formatSpendPublicStatusLine` only while paused, naming nothing; the question keeps the details. |

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
