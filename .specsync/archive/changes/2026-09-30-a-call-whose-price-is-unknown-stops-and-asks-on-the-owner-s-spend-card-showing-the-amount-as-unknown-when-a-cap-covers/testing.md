---
change: a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers
artifact: testing
---

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
