# Lesson bundle — at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: At a spend cap the run asks the owner on a DM spend Approve card with a one-time code instead of refusing; Approve lets only the paused call through at the amount shown and the next call past the cap asks again (SAFE-8, SAFE-8.a, SAFE-15, SAFE-19 money)
- **Kind**: Feature
- **Specs**: agent, discord
- **Paths**: src/agent/spend.ts, src/agent/spend-notice.ts, src/agent/execute.ts, src/agent/index.ts, src/discord/spend-card.ts, src/discord/bridge.ts, src/discord/ask-ping.ts, tests/agent.spend-approve.test.ts, tests/discord.spend-card.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/discord/discord.spec.md, specs/discord/testing.md, hi/safe.md, INTENT.md, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/DAEMON.md
- **Acceptance**: With an owner configured and a spend cap set, a priced model call whose estimate would pass the total cap or its provider's cap is held, not refused: the run records one spend Approve card (kind spend, class money) on the shared approvals store showing the action (send one model call to <model> via <provider>), the target (the tripped scope(s): total, provider:<id>) and the amount (that call's estimate), with the task and project label as quoted data, and says once in a Text event that it is waiting for the owner's OK (the live status shows the must-ask wait line; no amounts). The bridge's card engine DMs it to the owner; Approve alone sends nothing; Approve plus the one-time code (SAFE-19) lets exactly that call through, recorded once at the amount shown (SpendLedger.reserveApproved after a re-fit check), and the next call past the cap raises a new card and code (SAFE-8.a). Deny, no answer before the card lapses (4 min, below the council voice and LLM request timeouts), a late code, a run that is gone (waiter pid + start time), a stop or the per-request timeout while waiting is a no (SAFE-20): nothing is sent or spent and the attempt ends blocked with a spend-cap ask whose question says what the card came to and how to continue, without the reply note; the summary stays 'Work is paused for budget.' (SAFE-14.a) and a cap stop is never a model failure (no AGENT-11 fallback). One card per paused call, at most one open per run, none refused because another run's card is open. With no owner configured, and for unpriced, invalid-setting or ledger stops, the operator-action ask stays as on main. A CLI-only or daemon-only install records the card and waits out its TTL. The new tests fail on main's sources and pass on the branch; no schema bump; no new config key.

## Evidence

- Verification commit: `239854693f80b51e26b37f439f32b14f7908832f`
- Base commit: `519c58fd304adeb29ea4867ce7eb23426dda595c`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Issue #98 (M4 "Safe autonomy"): spend caps warn at 80% and **ask** at 100%.
#160 built the total cap, #317 made spend owner-only (SAFE-14.a) and #328 added
per-provider caps (SAFE-14 / SAFE-15). The v0.0.36 rollup on #98 left SAFE-8
and SAFE-15 partial: at 100% the run stops with an operator-action ask ("raise
or unset the cap and restart"), and no Approve card lets the owner continue.
#316 landed the Approve/Deny card engine with one-time codes and the `money`
class (SAFE-18..20), but nothing raised a money card; #319 added the must-ask
gate's cards and its "waiting for the owner's OK" Text event; #325's AGENT-11
fallback already treats a `SpendCapRefusal` as no model failure.

Confirmed HI (Leif's 2026-09-28 interview, /home/user/coord/interview-2026-09-28.md):

- Already on main: **SAFE-8** "When a daily spend cap is set, I get a warning
  at 80% of it, and at 100% the agent asks me (an Approve card to continue)
  instead of refusing or quietly running up the bill."; **SAFE-19**
  "Destructive actions and money actions also need a one-time code I type
  back; the code is valid once, only for that action, and expires quickly.";
  **SAFE-15** "It warns at 80% of a cap and stops and asks at 100%, for each
  cap."; **AUTONOMY-8** "It asks before any spend that would go over a cap."
- Captured in this change with `hi` (round 13, 2026-09-30): **SAFE-8.a**
  "One Approve and its code let only the paused call through, at the amount
  shown; the next call past the cap raises a new card and code."

Out of scope: unknown prices on a card (SAFE-16 round 13, the later
spend-caps-c change), a session-wide "allow the rest", moving SAFE-1 consent
onto cards, #232 / #233, and the stop button (stop-button-1 builds
`src/discord/run-control.ts` and the bridge run paths in parallel; this change
only registers its card kind in `bridge.ts`).

## From the change's design.md

# Design

- `src/agent/spend.ts`
  - `SpendLedger.reserve` is split into a private fit check and insert;
    `reserveApproved({ …, approvedMicroUsd })` runs the fit check again in its
    own IMMEDIATE transaction (re-arming like `reserve`), records one row at
    the estimate whatever it trips, and records nothing for an estimate over
    the approved amount.
  - `createSpendGuard({ approval })`: after a refused reservation of a priced
    call, `passOnCard` looks up the owner (`getOwner`; a caller's env without
    its own allowlist file uses this process's), and with none throws the
    plain ask. Otherwise, one card at a time per guard (a promise chain), it
    re-fits (sends at once if the call fits now), records the `spend` /
    `money` request (`spendCardFields`: title, action, target = tripped
    scopes, amount = estimate, text = who / where / project / spend when
    paused / task excerpt; requester = acting user; waiter =
    `scheduleRunnerId()`; TTL `SPEND_CARD_TTL_MS`), emits the AUTONOMY-8 wait
    note, and waits (`waitForDecision` with the call's own signal). An
    approval it consumes while not aborted → `reserveApproved` → the call is
    sent and settled as usual, plus an approval note. Anything else → the
    card variant of the ask (`denied` / `expired` / `aborted` /
    `unavailable`) as a `SpendCapRefusal`.
- `src/agent/spend-notice.ts`: `spendCapReachedAsk({ …, card })` keeps the
  amounts and the `Stopped at cap` marker, says what the card came to, and
  offers asking again for a new card and code or the operator action;
  `NO_REPLY_NOTE` stays only on the no-card path.
- `src/agent/execute.ts`: `approval` with the task text, the project label
  (`projectLabel(projectKeyFor(cwd))`) and Text-event notes; `chatCompletions`
  never turns a `SpendCapRefusal` into a timeout failure.
- `src/discord/spend-card.ts`: `spendApprovalKind` over `storedApprovalKind`
  (kind `spend`, class `money`, audit `spend-cap`); `bridge.ts` only adds it
  to the engine's kinds. `src/discord/ask-ping.ts`: comments only.
- No schema bump (`approval_requests` from v14 as is), no new table, config
  key, env var or slash command; `package.json` untouched.

Design choices pending Leif (the most conservative option consistent with
the confirmed text; see /home/user/coord/m34-defaults.md approvals and
spend-caps rows):

1. No owner configured: nobody can approve, so the stop keeps the
   operator-action ask at once and raises no card (as the must-ask gate
   refuses at once with no owner).
2. Unpriced-model, invalid-setting and unreadable-ledger stops raise no card
   (there is no price to approve); unknown prices on a card are the later
   spend-caps-c change (SAFE-16 round 13).
3. Card lifetime 4 minutes (below the 5-minute council voice cap), code
   lifetime 2 minutes (the engine's), waiter poll 1 s — code constants, no
   config key.
4. One card per paused call even when it passes two caps: its target names
   both (`total, provider:<id>`). The amount is the pre-call estimate (prompt
   bytes / 3 + a 4096-token reply reserve); "at the amount shown" binds the
   reservation (`reserveApproved` refuses a bigger estimate), while the call
   is still settled to what the provider reports afterwards.
5. No re-fit while the card is open: a lapse is a no even if old spend left
   the window meanwhile (nothing is spent without an answer); the call is
   re-fit only just before a card is raised.
6. Delegate and council workers raise their own cards (the recorded default:
   one card per paused call, no run refused), unlike the must-ask gate, which
   refuses workers; a killed worker's card closes through waiter liveness.
7. The card shows, as quoted data, the acting user id (or `local`), the
   surface, the project label, each tripped cap's spend when it paused and
   the task (up to 1500 characters, the cut marked). Amounts stay on the
   owner's DM; the requester's status only says it waits for the owner's OK.
8. After a no, the owner learns the outcome through the existing spend-cap
   DM (once per cap episode); the channel still says only "💸 Work is paused
   for budget.".
9. No extra SAFE-5 row when the waiting run uses the approval: the engine's
   `spend-cap-approve` rows and the request's `used` status record it.
10. A CLI-only or daemon-only install records the card and waits out the 4
    minutes (the recorded default) rather than stopping at once.

## From the change's testing.md

# Testing

Fixture tests only: a mocked fetch as the fake LLM, in-memory or temp-dir
SQLite, the real card engine with recording DMs, the bridge with a fake
gateway; no network, no real key, no Discord.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-198` | `tests/agent.spend-approve.test.ts` ("at 100% the owner's spend card holds the call") | Approve + code (approved, used once) sends exactly the paused call, recorded at the shown estimate; card kind / class / action / target / amount / title / requester / waiter / text; the wait note maps to the must-ask status with no `$`; SAFE-8.a second card; deny, lapse, late approval, abort and stop-as-approved send and record nothing and the ask names the card with no reply note; no owner, `withSpendCap` and an unpriced model raise no card; provider and two-cap targets. Fail on base: the file cannot load. |
| `REQ-agent-198` | `tests/agent.spend-approve.test.ts` ("several paused calls: one card each, at most one open per run, none refused") | A run's second card is recorded only after its first is decided; two runs paused at once each have a pending card. |
| `REQ-agent-198`, `REQ-agent-098` | `tests/agent.spend-approve.test.ts` ("SpendLedger.reserveApproved") | The approved amount is recorded past the cap with `trips`; a bigger estimate records nothing; a fitting call has empty `trips`; `SPEND_CARD_TTL_MS` is below `COUNCIL_VOICE_TIMEOUT_MS` and `LLM_REQUEST_TIMEOUT_MS`. |
| `REQ-agent-198`, `REQ-agent-098`, `REQ-agent-114` | `tests/agent.spend-approve.test.ts` ("createTaskExecute: a run asks on the card and says it is waiting") | At a $0 cap with an owner: approved — one call, both Text notes, the card holds the task and never the directory; denied — `runTask` `blocked` with the generic summary and verify not run; a 50 ms request timeout ending the wait with a two-model chain calls no provider and never falls back. Probe on base (main's APIs only): no card, no call, the plain ask. |
| `REQ-discord-198` | `tests/discord.spend-card.test.ts` ("the spend card on the engine") | The owner gets the task as quoted data, then the card; Approve alone sends nothing; Approve + the code sends the call once and answers `SPEND_CARD_APPROVED`; `spend-cap-card` / `spend-cap-approve` audit rows; Deny, another user's press and code, a late code and a gone waiter are a no. Fail on base: the file cannot load. |
| `REQ-discord-198` | `tests/discord.spend-card.test.ts` ("the bridge registers the spend card kind") | The bridge DMs a spend card another process recorded with its `cvok:spend:approve:<id>` button and answers Approve with the code step and an 8-character code. |
| `REQ-agent-098`, `REQ-agent-114` | `tests/agent.spend.test.ts`, `tests/agent.spend-ask.test.ts`, `tests/agent.spend-caps.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.spend-dm.test.ts`, `tests/scheduler.ask-outbox.test.ts`, `tests/must-ask.gate.test.ts`, `tests/agent.fallback.test.ts` | The no-owner / no-card path keeps its text and behaviour unchanged (no regression). |

## Automated coverage

- `tests/agent.spend-approve.test.ts` (21 tests) and
  `tests/discord.spend-card.test.ts` (6 tests).
- Fail on base: with main's (0aeb345) sources swapped in, both files fail to
  load (missing `setSpendCardTestHooks` and `src/discord/spend-card.ts`); a
  probe on main's APIs (`createTaskExecute` at a $0 cap with an owner and
  every pending approval approved at once) prints
  `{"calls":0,"summary":"Work is paused for budget.","ask":"spend-cap","cards":[]}`
  on base and
  `{"calls":1,"summary":"ok","ask":null,"cards":[{"kind":"spend","class":"money","status":"used"}]}`
  on the branch. Restored: all pass.
- The full `bun test` and `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
