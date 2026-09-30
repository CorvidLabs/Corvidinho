---
change: at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets
artifact: testing
---

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
