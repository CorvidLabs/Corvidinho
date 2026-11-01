---
change: at-a-spend-cap-a-flat-priced-tool-call-web-search-gif-search-waits-on-the-owner-s-spend-approve-card-like-a-model-call
artifact: testing
---

# Testing

New tests: 7 in `tests/agent.spend-approve.test.ts` ("a flat-priced tool
call past the total cap waits on the same spend card …"), 3 in
`tests/web.search.test.ts` ("at the cap a search waits on the owner's spend
Approve card, as a model call does …") and 1 in `tests/gif.search.test.ts`
("past the cap a GIF search waits on the owner's spend Approve card …").
In-memory or temp-dir SQLite, a fixed owner in the run's env, the fake Brave
/ GIPHY transport and resolver, a mocked LLM fetch; cards are decided in the
approvals store as the bridge's engine would (`setSpendCardTestHooks`). No
network. Every `bun test` / verify run used a private `TMPDIR`
(`mktemp -d /home/user/coord/tmp/w14.XXXXXX`, removed after).

Fail-on-main proof: with main's (`49273ff4`) `src/agent/spend.ts`,
`src/agent/execute.ts`, `src/plugins/types.ts`, `src/plugins/run.ts`,
`plugins/web/search.ts`, `plugins/web/commands.ts`, `plugins/gif/giphy.ts`
and `plugins/gif/commands.ts` swapped in: `tests/agent.spend-approve.test.ts
-t "flat-priced tool call past the total cap"` 1 pass, 6 fail (the passing
one is the "no card where a model call gets none" case, which keeps main's
behavior by design); `tests/web.search.test.ts -t "spend Approve card"` 0
pass, 3 fail; `tests/gif.search.test.ts -t "spend Approve card"` 0 pass, 1
fail. Restored: all 11 pass, and the existing spend and search suites
(`agent.spend*`, `web.search`, `gif.search`) pass unchanged.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-398` | `tests/agent.spend-approve.test.ts` ("Approve + code: exactly that one search is let through …") | One `spend` / `money` card: action `send one web-search via api.search.brave.com`, target `total`, amount `~$0.0050 (this one call's estimate)`; status `used`; one row at 5000, settled once to `actual`; wait note without amounts; no model call; `finish` untouched. Fails on main. |
| `REQ-agent-398` | `tests/agent.spend-approve.test.ts` ("SAFE-8.a: the next search past the cap raises a new card and code …") | A second card with its own id; denied, no second row. Fails on main. |
| `REQ-agent-398` | `tests/agent.spend-approve.test.ts` ("Deny: …") | `stopped`, no row; `spendCapReachedAsk` names the denied card, `Stopped at cap: total.`, both ways on, no reply note. Fails on main. |
| `REQ-agent-398` | `tests/agent.spend-approve.test.ts` ("no answer in time, a late code and the run's stop are a no …") | Lapse (`expired`, a late approval returns false), the run's stop (fast, `expired`, "was cut short"), a stop as the owner approves (left `approved`), an already-stopped run (no card): `stopped`, no row. Fails on main. |
| `REQ-agent-398` | `tests/agent.spend-approve.test.ts` ("where a model call gets no card, neither does a search …") | No owner (plain ask at once), a guard without `approval` (`flatCard` undefined), invalid setting, unavailable ledger: today's ask, no card, no row. Passes on main (behavior kept). |
| `REQ-agent-398` | `tests/agent.spend-approve.test.ts` ("a search and a model call of one run share its one open card …") | The search's card is recorded only after the model call's card is decided. Fails on main. |
| `REQ-agent-398` | `tests/agent.spend-approve.test.ts` ("a free GIPHY gif-search ($0) …") | `send one gif-search via api.giphy.com`, `~$0.00`; approved `held` at 0, denied `stopped`. Fails on main. |
| `REQ-agent-398` | `tests/web.search.test.ts` ("in the tool loop: approved, …") | Through `createTaskExecute`: one Brave request, `actual` 5000, the run goes on with no ask; the tool message and `ToolResult` carry no `$` amount, `CORVIDINHO_`, spend or card text; wait and approval Text events. Fails on main. |
| `REQ-agent-398` | `tests/web.search.test.ts` ("in the tool loop: denied, …") | No Brave request, one model call, `SPEND_CAP_SUMMARY`, the `spend-cap` ask naming the card, `ToolResult` success false with `SPEND_CAP_SUMMARY`, no row. Fails on main. |
| `REQ-agent-098` | `tests/web.search.test.ts`, `tests/gif.search.test.ts` (existing SAFE-8 cases) | Without a card (the guard has no cap or no owner in those runs) a flat call past the cap, an invalid setting and an unavailable ledger still stop with the `spend-cap` ask; under the cap rows settle as before. |
| `REQ-plugins-398` | `tests/web.search.test.ts` ("the handler: the run's card lets exactly that one search through …") | `ctx.spendCard` reaches `reserveFlatSpend`: approved, one request, no `spendAsk`, nothing outside the fence names an amount; denied, no request, exit 2, `spend-cap`, "Work is paused for budget." and the card in `spendAsk`. Fails on main. |
| `REQ-plugins-398` | `tests/gif.search.test.ts` ("approved, exactly that one search is sent and recorded at $0 …") | The same through `gif-search` at $0. Fails on main. |

Gates: `specsync change check --commit`, `specsync change audit`,
`specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`,
`bun test`, `fledge lanes run verify --non-interactive`.
