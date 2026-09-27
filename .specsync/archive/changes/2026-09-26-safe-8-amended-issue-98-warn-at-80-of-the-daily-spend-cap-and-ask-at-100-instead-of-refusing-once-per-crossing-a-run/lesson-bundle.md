# Lesson bundle — safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-8 amended (issue #98): warn at 80% of the daily spend cap and ask at 100% instead of refusing. Once per crossing a run that pushes rolling 24h spend to 80% of CORVIDINHO_DAILY_SPEND_CAP_USD emits a warning (Text event, result spendWarning, Discord reply line with owner ping); a provider call that would pass the cap is stopped before it is sent and the run ends blocked with a spend-cap ask to the owner via the AUTONOMY-1/2 ask path stating spend vs cap and how to continue; doctor and Discord /status show 24h spend vs the cap (AUTONOMOUS-8); Approve card (#96) left for HI capture
- **Kind**: Feature
- **Specs**: agent, cli, discord
- **Paths**: src/agent/spend.ts, src/agent/spend-notice.ts, src/agent/execute.ts, src/agent/types.ts, src/agent/ask.ts, src/agent/index.ts, src/cli.ts, src/discord/ask-ping.ts, src/discord/agent-client.ts, src/discord/types.ts, src/discord/bridge.ts, src/discord/slash-types.ts, src/discord/command-handlers/status.ts, src/scheduler/service.ts, tests/agent.spend.test.ts, tests/agent.spend-ask.test.ts, tests/discord.spend.test.ts, .env.example, specs/agent/, specs/cli/, specs/discord/
- **Acceptance**: With CORVIDINHO_DAILY_SPEND_CAP_USD set: (1) when a run's settled provider call brings rolling 24h spend to at least 80% of the cap, one warning is recorded in a module-owned spend_alerts table inside an IMMEDIATE transaction (at most once per cap value per 24h across processes), the run emits a Text event naming spend vs cap, TaskResult.spendWarning carries the numbers on --json and the NDJSON result frame, and the Discord chat reply and schedule post append a warning line that pings the configured owner; (2) a provider call whose estimate would push spend past the cap (or any call while the cap value is invalid, the model is unpriced, or the ledger is unavailable) is never sent: the attempt ends with an ask reason spend-cap whose question states spend, estimate and cap and says how to continue (raise or unset the cap and ask again, or wait for spend to leave the window), runTask returns state blocked (verify skipped, exit 0), and the Discord bridge and scheduler post it through the AUTONOMY-1/2 ask path with the owner pinged (schedules ping once until a clean run); (3) doctor always prints a spend line (info when no cap, ok/warn with 24h spend, cap and percent, warn at 80% and at the cap) and Discord /status shows the same 24h spend vs cap line; no cap means the fetch is untouched and no DB is opened; fixture tests with mocked fetch only

## Evidence

- Verification commit: `09490b0cac74c7292da3581adf57529101ddc50c`
- Base commit: `c238e3029a833915f1b31f75d23ed09f6e5c584f`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

PR #160 shipped the first SAFE-8 slice (change
`safe-8-daily-spend-cap-issue-98-captured-slice-…`): an optional
`CORVIDINHO_DAILY_SPEND_CAP_USD`, a per-model price table, a `spend_ledger`
in the shared SQLite DB, and a hard refusal of any provider call that would
break the cap. That matched the SAFE-8 wording at the time ("refused").

Leif then decided on #98 (captured in `hi/safe.md` by #162) that SAFE-8 reads:
"When a daily spend cap is set, I get a warning at 80% of it, and at 100% the
agent asks me (an Approve card to continue) instead of refusing or quietly
running up the bill." AUTONOMOUS-8 ("I can see credit/spend usage for
autonomous runs against a budget I set") is unchanged. PR #160 was put on
hold with a review comment asking for the 80% warning and an ask at 100%.

Constraints for a session picking this up:

- The Approve card itself is #96 (draft SAFE-18..20) and is NOT captured, so
  it is not built. The ask path that exists on main is AUTONOMY-1/2 (#163):
  a run can end `blocked` with a `HumanAsk`; Discord posts the question and
  pings the configured owner (`src/discord/ask-ping.ts`), schedules dedupe
  the owner ping per question. This change reuses that path.
- No new slash command, env var or product surface; `/status` and `doctor`
  get a line. Draft SAFE-14..16 (per-provider caps, unknown spend shown as
  unknown) stay left for HI capture.
- The earlier change's ledger, price table and estimates are kept as is; this
  change only modifies REQ-agent-098 / REQ-cli-098 / REQ-discord-098.
- No schema version bump: `spend_alerts` is created with CREATE TABLE IF NOT
  EXISTS (now in `src/agent/spend-alerts.ts`), like `spend_ledger`.
- PR #160 review found that the warning was recorded once globally but only
  shown by Discord chat and bridge schedule posts, that `/work` and
  `/session start` ignored the ask, that the chat ask invited a reply that
  could not help and pinged the owner on every message, and that a second
  crossing inside 24 h stayed silent. This change's review round fixes
  those; SAFE-8 is only partially met until the Approve card (#96) is
  captured and built.

## From the change's design.md

# Design

## Ask at 100% (no spend past the cap)

- `createSpendGuard(fetch, opts)` in `src/agent/spend.ts` returns
  `{ fetch, finish }`. With no cap, `fetch` is the original fetch and
  `finish` is the identity (no DB, no behavior change).
- With a cap, the guarded fetch still reserves the estimate in one IMMEDIATE
  transaction. When the reservation is refused (spend + estimate > cap), or
  the cap value is invalid, the model is unpriced, or the ledger cannot be
  opened, it records a `HumanAsk { reason: "spend-cap", question }` and
  throws `SpendCapRefusal` (which carries the ask) before any request.
- The tool loop's existing `chatCompletions` catch turns the throw into an
  error result, so the attempt returns immediately and no further call is
  made. `createTaskExecute` passes every attempt's result through
  `spend.finish`, which swaps it for `{ summary: SPEND_CAP_SUMMARY,
  filesChanged, ask }` when an ask is pending. `runTask` already maps
  `ExecuteResult.ask` to state `blocked` with verify skipped and no retry
  (AUTONOMY-1), so the run ends `blocked` and `task run` exits 0.
- Hot-file footprint: `execute.ts` swaps `withSpendCap` for
  `createSpendGuard`, adds `onSpendWarning`, and wraps the returned closure
  (`return async (ctx) => spend.finish(await run(ctx))`).

## Warn at 80% (once per crossing)

- After each settle, `SpendLedger.noteWarning({ capMicroUsd, now })` runs one
  IMMEDIATE transaction: read 24 h spend; if ≥ 80% and the warning for this
  cap value is armed, insert a pending `warn` row (`delivered_at` NULL) and
  return `SpendWarning { spentMicroUsd, capMicroUsd, percent }`. Concurrent
  processes therefore warn once between them; a zero cap never warns.
- Arming lives in `src/agent/spend-alerts.ts`. Rows carry their cap value.
  The warning is armed unless a `warn` row for that cap value is newer than
  the last `rearm` row for it and < 24 h old. A settle or the next call's
  reservation that sees spend under 70% records a `rearm` row (only when
  something is disarmed), so a second crossing inside 24 h warns again
  (review finding: the first cut warned at most once per cap per 24 h). The
  70–80% band stops spend that hovers at 80% (old calls leaving the window,
  new ones arriving) from warning on every call; per-cap rows stop a process
  with a much larger cap from re-arming a smaller one.

## Delivery is separate from recording (review finding, major)

The first cut showed the warning only on Discord chat replies and bridge
schedule posts, while the dedupe was global: a crossing made by WATCH,
`/work`, `/session start`, a delegate worker, the daemon or a schedule whose
channel left the allowlist recorded the row and silently used the warning up
for 24 h.

- `spend_alerts.delivered_at` (added with ALTER TABLE to an older table).
  Runs only record. `src/agent/spend-outbox.ts` `createSpendAlertOutbox({
  db, env })` is the delivery side: `takeWarning(fallback)` claims every
  pending warning of the last 24 h in one IMMEDIATE transaction and returns
  it with current spend (dropped when spend is back under 80%);
  `release()` hands it back when the post failed. No DB (or no table) ⇒ the
  run's own `spendWarning`.
- The bridge builds one outbox and every post takes from it: chat reply,
  `/work`, `/session start`, schedule posts. So a warning recorded anywhere
  on the data dir reaches the owner on the bridge's next post, once.
- The daemon logs `spend.warning` / `run.needs_human` (warn); the row stays
  pending for a bridge. The CLI keeps printing the `Text` warning to stderr.

## Spend-cap ask on every surface (review findings, minor)

- `claimCapPing()` (a delivered `cap` row, same arming as the warning) makes
  the owner ping once per cap episode across chat, slash commands and
  schedules (`src/discord/spend-post.ts` `askPingOwner`). Schedules keep
  their per-schedule ping key too.
- `/work` and `/session start` now handle `result.ask` like chat: the ask in
  the reply through `formatAskReply`, paused status (not ✅), `/work` status
  `blocked` (new `WorkTaskStatus`; stuck stays `failed`), a spend-cap PR
  line. The owner ping and pending warning go out as a fresh channel post
  (`SlashContext.post` = gateway reply), because an edit of a deferred reply
  may not notify a mention; without a post function (or on failure) they are
  appended to the reply.
- With AUTONOMY-4 (#189) on main, a clarify ask addresses the requester and
  a stuck ask pings the owner; `formatAskReply` treats `spend-cap` like
  stuck (owner), `/work` and `/session start` address the requester on
  clarify and send the owner notice only for stuck / spend-cap
  (`askNeedsOwner`), and the bridge's thin-reply restatement of a pending
  spend-cap ask goes through the same once-per-episode claim.
- No Approve card exists (#96), so a reply cannot unblock: the questions end
  with the operator action and "Replying can't lift the cap — this needs the
  operator." (no `?`), and `formatAskReply` drops the reply hint for a
  spend-cap ask. The headline names the operator.
- The run's summary at the cap is `SPEND_CAP_SUMMARY` (no amounts, no env
  names), so WATCH's public GitHub reply leaks nothing; the ask question
  keeps the details for Discord and the CLI (text mode prints it).
- `createTaskExecute` emits it as a `Text` event (NDJSON `Text` frame / CLI
  stderr) and calls `onSpendWarning`; `task run` copies it onto
  `TaskResult.spendWarning` (so `--json` and the NDJSON `result` frame carry
  integer amounts).

## Discord

- `HumanAskReason` gains `spend-cap` (and `askFromUnknown` accepts it).
  `formatAskReply` uses a spend-cap headline and a paused status (not an
  error); `askPingKey` keys a spend-cap ask on its reason only so a schedule
  pings once per cap episode.
- The spawn client validates `result.spendWarning` with
  `spendWarningFromUnknown` (integers only, percent recomputed). Bridge posts
  go through `withSpendWarningPost` with the warning taken from the outbox,
  which appends the warning line rebuilt from the amounts and adds the owner
  to `mentionUserIds`.
- `/status`: `SlashContext.spendLine` (bridge closure over
  `readSpendSnapshot` on its shared DB) → `formatSpendStatusLine`.

## Text lives in one place

`src/agent/spend-notice.ts` is pure formatting (warning line, ask questions,
doctor and status lines, validation); `spend.ts` re-exports `SPEND_CAP_ENV`
and `formatUsd` from it, and only type-imports back, so there is no runtime
cycle.

## From the change's testing.md

# Testing

All fixtures: mocked fetch, a localhost mock LLM (`Bun.serve` on
127.0.0.1), a fake gateway, a fake `sh` bin for the spawn client, in-memory
or temp-dir SQLite. No network, no real keys, no git worktrees.

- `tests/agent.spend.test.ts` (updated): the cap stop now carries a
  `spend-cap` ask with spend vs cap and how to continue; unpriced / invalid
  still stop before the ledger or fetch; `createTaskExecute` at a zero cap
  returns the ask on every attempt; doctor prints `info` without a cap and
  the percent with one.
- `tests/agent.spend-ask.test.ts` (new): `noteWarning` fires once at 80%,
  stays quiet on repeats, re-arms on a new cap and after 24 h, never for a
  zero cap, and once across two connections on one file; the guard fires
  `onWarning` once on the crossing call and records nothing without a
  listener; `finish` swaps the result once and keeps `filesChanged`;
  `runTask` ends `blocked` (verify runner never called, no fetch);
  `createTaskExecute` emits exactly one `Text` warning; notice formatting,
  validation and scrubbing; `readSpendSnapshot` never throws; `task run
  --json` against the localhost mock carries `result.spendWarning` on the
  crossing run only and returns `blocked` with a `spend-cap` ask at the cap
  without hitting the mock.
- `tests/discord.spend.test.ts` (new): spend-cap ask headline / status /
  owner ping; stable `askPingKey`; warning line + mention merge + length cut;
  bridge reply for a spend-cap ask (status not an error) and for a warning;
  `/status` shows 24 h spend vs cap from the bridge DB; spawn client keeps a
  valid `spendWarning` and drops a malformed one; scheduler post carries the
  warning and pings the owner.
- Review round (PR #160 review):
  - `tests/agent.spend-ask.test.ts`: the reviewer's repro ($0.90 at T0-23h
    warns at T0; at T0+2h the window is $0 and a check re-arms; $0.85 then
    warns again), the reservation re-arms too, spend hovering between 70%
    and 80% does not re-warn; the outbox (no DB → run's warning; a DB
    without spend tables is left alone; a recorded warning is claimed once
    with current spend, released and re-taken, dropped when moot;
    `claimCapPing` once per episode, re-armed under 70% or after 24 h; an
    older `spend_alerts` table gains `delivered_at`); ask questions have no
    `?` and end with the operator note; summary at the cap is
    `SPEND_CAP_SUMMARY`; `task run --output text` at the cap prints the
    summary and the question.
  - `tests/discord.spend.test.ts`: a WATCH-style guard on a shared DB file
    crosses 80% (its `onWarning` ignored) and the next bridge chat reply
    carries the warning with the owner pinged, once; `/work` delivers a
    pending warning as a fresh post; two chat asks at the cap ping once, no
    reply hint, re-armed after a reservation under 70%; `/work` at the cap
    is `blocked`, paused, shows the ask and the spend-cap PR line, pings the
    owner once in a fresh post and not again; `/session start` at the cap;
    `replyWithOwnerNotice` falls back to the reply; a schedule ask in an
    already-pinged episode posts without a mention; the daemon logs
    `spend.warning` and `run.needs_human`; a thin reply to a spend-cap ask
    restates it without a mention or agent run; a `/work` clarify ask
    addresses the requester with no owner post (AUTONOMY-4).
- Full suite: `bun test`, `bunx tsc --noEmit`, `specsync check
  --require-coverage 100`, `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
