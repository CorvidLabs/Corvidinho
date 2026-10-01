# Lesson bundle — a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A call whose price is unknown stops and asks on the owner's spend card showing the amount as unknown when a cap covers it (recorded unknown, owner lines read $X + unknown, no price override), and every surface asks before spending over a cap: WATCH spend-cap stops reach the owner by DM and a schedule's spend-cap stop can go on through the card (SAFE-16, SAFE-16.a, AUTONOMY-8)
- **Kind**: Feature
- **Specs**: agent, discord, watch
- **Paths**: src/agent/spend.ts, src/agent/spend-notice.ts, src/agent/spend-outbox.ts, src/agent/types.ts, src/discord/spend-card.ts, src/discord/watch-ask.ts, src/discord/schedule-ask.ts, src/scheduler/store.ts, src/scheduler/service.ts, src/store/db.ts, src/watch/owner-ask.ts, tests/agent.spend-unknown.test.ts, tests/spend.surfaces.test.ts, tests/agent.spend-approve.test.ts, tests/agent.spend-ask.test.ts, tests/agent.spend-caps.test.ts, tests/agent.spend.test.ts, tests/discord.schedule-ask.test.ts, tests/discord.spend-dm.test.ts, tests/scheduler.ask-block.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/watch/watch.spec.md, specs/watch/testing.md, hi/safe.md, INTENT.md, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/DAEMON.md, docs/WATCH.md
- **Acceptance**: With a spend cap covering the call (the total cap, its provider's cap, or both) and an owner configured, a model call whose price is unknown is held, not sent, and asks the owner on a DM spend card (kind spend, class money: Approve plus the one-time code) whose Amount reads unknown (never $0), whose Target names every covering cap and whose title says Spend at an unknown price; Approve plus the code lets exactly that call through, recorded in spend_ledger with status unknown (no amount), and the next such call asks again; deny, no answer, a late code or a stop sends and records nothing and the run ends blocked with the unpriced spend-cap ask naming the card, without the reply note. With no cap covering it the call just runs, unrecorded, with no card; with no owner (or no card path) the operator ask comes at once as before; there is no price override. The rolling window counts unknownCalls, and every owner spend line (doctor, the owner's /status, the 80% warning and its DM, the stop ask and the card context) reads $X + unknown while the window holds such a call; non-owners still see only Work is paused for budget. A WATCH run stopped at a spend cap is recorded in watch_owner_asks (reason spend-cap) and the bridge DMs the owner the stop's details with the GitHub thread once per cap episode, while GitHub shows only the pause. A schedule's spend-cap stop carries Continue (the owner's only; closes it continued with no answer handed on, so the next run asks on a card before any call past a cap) and Cancel. A cross-surface test drives chat, slash /session and /work, ask buttons, schedules, the daemon, WATCH, the CLI and delegate/council workers through their real spawn env and shows each stops and asks before spending over the total cap, a provider cap and at an unknown price. The new tests fail on main's sources and pass on the branch; no schema bump, no new config key or env var.

## Evidence

- Verification commit: `8fd65c33dd8e0ddce6926e90b32abe78c987a2d2`
- Base commit: `f7258afa99d485a8b93d3950dd890ac02fe2f59c`
- Verified by: `specsync check --spec agent --spec discord --spec watch`

## From the change's context.md

# Context

Issue #98 (M4 "Safe autonomy"): spend caps warn at 80% and ask at 100%, and an
unknown price is never free. #160 built the total cap, #317 made spend
owner-only (SAFE-14.a), #328 added per-provider caps (SAFE-14 / SAFE-15) and
#334 the owner's DM spend card (SAFE-8 / SAFE-8.a, class `money`). On main
(`9ea4005`) an unpriced model under a cap still stopped at once with an
operator ask ("switch to a priced model or unset the cap") and no card, since
#334 raised cards only for priced calls. The v0.0.36 rollup on #98 also found
that a WATCH run stopped at a cap reached nobody: `noteWatchRunAsk` queued only
stuck asks, and GitHub shows only "Work is paused for budget.". A schedule's
spend-cap stop had Cancel only ("continuing past the cap is not a choice
here"), written before the spend card existed.

Confirmed HI (Leif's 2026-09-28 interview, /home/user/coord/interview-2026-09-28.md):

- On main: **SAFE-16** "An unknown model price counts as unknown and shows as
  unknown, never as free." and **AUTONOMY-8** "It asks before any spend that
  would go over a cap."
- Captured in this change with `hi` (round 13, 2026-09-30): **SAFE-16.a** "A
  call whose price is unknown stops and asks on a card that shows the amount
  as unknown when a cap covers it; with no cap covering it, it just runs;
  there is no price override."

Planned scope: /home/user/coord/pr-spend-caps-c.json (M3/M4 synthesis) and the
spend-caps rows of /home/user/coord/m34-defaults.md. Out of scope: a price
override (none may be added), #232 / #233, the stop button (stop-button-2) and
the CLI worktree (cli-worktree), which build in parallel; `bridge.ts` is not
touched.

## From the change's design.md

# Design

- `src/agent/spend.ts`
  - Ledger: status `unknown` (estimate and cost 0, so it never adds to the
    priced spend and is never shown as $0); `window` adds `unknownCalls`;
    `covering` lists the caps that cover a call with their spend (and unknown
    count); `recordUnknown` inserts one approved unknown-price row; `settle`
    keeps `unknown` rows `unknown` with their tokens (`failed` on an HTTP
    error); `fit` and `noteWarning` carry each scope's `unknownCalls` into
    `SpendTrip` / `SpendWarning`.
  - Guard: the card raise-and-wait is shared (`waitOnCard`: request,
    AUTONOMY-8 note, `waitForDecision`, consume; never throws), used by the
    priced `passOnCard` (unchanged behaviour) and the new `passUnknownOnCard`
    (no `approval` or no owner → the unpriced operator ask before the ledger
    opens; else one card at a time per run, `covering` for the target and
    text, approve → `recordUnknown` → send → settle `unknown`; a no → the
    unpriced ask with the card outcome). An uncovered unpriced call is sent
    unrecorded as before. No price table change, no override key.
  - `spendCardFields({ estimateMicroUsd: null })`: the unknown-price title,
    target every covering cap, amount `unknown (…)`, text saying the cost is
    unknown and never counted as $0.
- `src/agent/spend-notice.ts`: `formatSpend` ("$X + unknown"),
  `SpendTrip.unknownCalls`, the card variant of `spendCapUnpricedAsk`
  (no reply note, both ways on), doctor / `/status` / warning lines through
  `formatSpend`; `spendWarningFromUnknown` keeps a whole positive count.
- `src/agent/spend-outbox.ts`: `takeWarning` adds each scope's unknown count.
- `src/discord/spend-card.ts`: `approvedOutcome` picks
  `SPEND_CARD_UNKNOWN_APPROVED` for an unknown amount.
- `src/watch/owner-ask.ts`: `WATCH_OWNER_ASK_REASONS` (`stuck`,
  `spend-cap`); `noteWatchRunAsk` records spend-cap stops with their own
  log wording (no amounts). `src/discord/watch-ask.ts`: spend-cap stops are
  DMed as `formatWatchSpendStopDm`, gated once per cap episode by the spend
  alert outbox's `claimCapPing` (built over the delivery's DB — no
  `bridge.ts` change), with the claim released on a failed DM.
- `src/discord/schedule-ask.ts`: a spend-cap stop's controls are Continue
  (its `open` custom id, so no new custom-id kind) and Cancel; only the live
  owner's Continue counts and closes it `continued` (`src/scheduler/store.ts`
  `ScheduleAskOutcome`), which hands no answer on (`answeredAsk` reads only
  `answered` / `picked`).
- No schema bump (`spend_ledger.status` and `schedule_runs.ask_outcome` are
  TEXT), no new table, config key, env var or slash command; `package.json`
  untouched.

## From the change's testing.md

# Testing

Fixture tests only: a mocked fetch as the fake LLM, in-memory or temp-dir
SQLite, a stand-in `corvidinho` bin that records the env its spawner gives
`task run`, the real card engine with recording DMs, the WATCH poller with
injected events and the echo ack client, and the bridge with a fake gateway;
no network, no real key, no Discord.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-199` | `tests/agent.spend-unknown.test.ts` ("SAFE-16.a: an unpriced call under a cap stops and asks on a card showing the amount as unknown") | The card (kind `spend`, class `money`, title `Spend at an unknown price — asks first (SAFE-16.a) · from cli`, target `total`, amount `unknown (…)` with no `$` figure) is recorded before any call; approved → one call, `used`, one `unknown` row (no amount, the reply's tokens), `unknownCalls` 1; the next call raises a second card; deny / lapse / abort → nothing sent or recorded and the unpriced ask names the card without the reply note; provider and two-cap targets; no covering cap → runs, no card, no ledger; no owner or `withSpendCap` → operator ask, no DB; HTTP error → `failed`; no price override. Fail on base: the file cannot load. |
| `REQ-agent-199` | `tests/agent.spend-unknown.test.ts` ("owner lines read \"$X + unknown\"") | `formatSpend`; doctor and provider lines (`$4.50 + unknown of $5.00 …, 1 at an unknown price`); owner `/status`; the 80% warning, the outbox's DM and `spendWarningFromUnknown`; a priced stop's card text and ask; the public line has no amount. |
| `REQ-agent-199` | `tests/agent.spend-unknown.test.ts` ("createTaskExecute with an unpriced model under a cap") | Approved: the call goes out with the wait and approval Text events; denied: `runTask` `blocked`, generic summary, verify not run. |
| `REQ-agent-199` | `tests/spend.surfaces.test.ts` ("AUTONOMY-8: every surface stops and asks before spending over any cap") | Chat, slash `/session`, slash `/work`, ask buttons, schedules, the daemon, WATCH, the CLI and a delegate / council worker (each through its real spawner's env): no provider call before the owner's card is decided past the total cap, past a provider cap and at an unknown price; the card names the surface; a no ends `blocked` on the spend-cap ask; with no owner each stops at once with the operator ask. Fail on base: the nine unknown-price cases fail; the priced and no-owner cases pass (regression). |
| `REQ-agent-098`, `REQ-agent-114`, `REQ-agent-198` | `tests/agent.spend-approve.test.ts` ("SAFE-16.a: an unpriced model under a cap asks on a card whose amount is unknown"), `tests/agent.spend.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.spend-caps.test.ts` | The unpriced stop with an owner raises a card whose amount is unknown (fails on base: no card); the no-owner / `withSpendCap` unpriced stop, the invalid-setting and ledger stops and the priced card keep their behaviour; windows carry `unknownCalls: 0`. |
| `REQ-watch-099`, `REQ-watch-086` | `tests/spend.surfaces.test.ts` ("WATCH: a run stopped at a spend cap is handed to the bridge …": the poller test and the `noteWatchRunAsk` test), `tests/watch.stuck-ask.test.ts` | The poller records a `spend-cap` row, logs `queued for the owner's Discord DM (AUTONOMY-8)` with no amount, and the summary comment says only "Work is paused for budget."; no owner → `not-sent`, no bridge → `no-bridge`, a later run with no ask drops it; stuck asks unchanged. Fail on base: nothing is recorded. |
| `REQ-discord-199`, `REQ-discord-086` | `tests/spend.surfaces.test.ts` ("the bridge DMs the owner the stop's details …"), `tests/watch.stuck-ask.test.ts` | A failed DM hands back the ask and the episode claim; the next pass DMs `SPEND_STOP_DM_HEAD`, the GitHub line and the quoted details, no mention; a second stop in the same episode is taken and not DMed; stuck asks keep their DM. Fail on base: main's delivery never gets a spend-cap stop. |
| `REQ-discord-199`, `REQ-discord-198` | `tests/agent.spend-unknown.test.ts` ("the unknown-price card on the bridge's engine"), `tests/discord.spend-card.test.ts` | The engine DMs `Amount: unknown (…)`; Approve plus the code sends the call once and answers `SPEND_CARD_UNKNOWN_APPROVED`; priced cards keep `SPEND_CARD_APPROVED`. |
| `REQ-discord-606` | `tests/discord.schedule-ask.test.ts` ("a spend-cap stop takes the owner's Continue or Cancel …"), `tests/scheduler.ask-block.test.ts` ("a spend-cap stop: Continue (the owner's) and Cancel …"), `tests/spend.surfaces.test.ts` ("schedules: a spend-cap stop can go on through the card") | The post and its wait note carry Continue + Cancel and name no amount; the creator's Continue and an Answer submit are refused; the owner's Continue closes it `continued` with no answer handed on and a private ack naming no amount; the creator's Cancel still closes it. Fail on base: `["Cancel"]` only, and the press test cannot load. |

## Automated coverage

- `tests/agent.spend-unknown.test.ts` (18 tests) and `tests/spend.surfaces.test.ts` (40 tests), plus the updated tests named above.
- Fail on base: with main's (`9ea4005`) sources swapped in, `tests/agent.spend-unknown.test.ts` and `tests/discord.schedule-ask.test.ts` cannot load, `tests/spend.surfaces.test.ts` fails 13 of 40, `tests/scheduler.ask-block.test.ts` fails its spend-cap controls test and `tests/agent.spend-approve.test.ts` its SAFE-16.a test. A probe using only main's APIs prints `{"unpriced":{"calls":0,"cards":[],"ask":"Spend cap can't be enforced (SAFE-8): model …"},"watchSpendCap":"none","scheduleSpendCapControls":["Cancel"]}` on base and `{"unpriced":{"calls":1,"cards":[{"amount":"unknown (…)","title":"Spend at an unknown price — asks first (SAFE-16.a) · from cli"}],"ask":null,"unknownCalls":1},"watchSpendCap":"no-bridge","scheduleSpendCapControls":["Continue","Cancel"]}` on the branch. Restored: all pass.
- The full `bun test` and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
