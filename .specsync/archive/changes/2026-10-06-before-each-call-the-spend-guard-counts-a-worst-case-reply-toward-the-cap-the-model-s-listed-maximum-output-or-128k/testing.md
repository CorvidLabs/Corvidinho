---
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
artifact: testing
---

# Testing

`tests/agent.spend-reserve.test.ts` (11 tests): a mocked provider fetch, an
in-memory SQLite ledger (a temp data dir for the `createTaskExecute` case),
a fixed owner in the run's env, spend cards decided in the approval store as
the bridge's engine would. No network, no real keys.

Fail-on-base proof: with main's (e1a24ed) `src/agent/spend.ts` and
`src/agent/index.ts` swapped in, `bun test tests/agent.spend-reserve.test.ts`
gave 3 pass, 8 fail: the three reserve units (no listed maximum; the
estimate is 1000 × 2.5 + 4096 × 10; the default is 4096), the four "asks
first" cases (the $0.10 total cap and the provider cap let the call go out;
no card is raised; a deny has nothing to deny) and the "fits" case (the
in-flight row holds 4096 reply tokens, not 16384). The 3 that pass on both
are the no-`max_tokens` execute check and the two unpriced-model checks
(unchanged behaviour). Restored: 11 of 11 pass.

The spend suites (`tests/agent.spend*.test.ts`, `tests/discord.spend*.test.ts`,
`tests/spend.surfaces.test.ts`, `tests/web.search.test.ts`,
`tests/gif.search.test.ts`, `tests/agent.fallback.test.ts`,
`tests/autonomous.*.test.ts`) still pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-298` | `tests/agent.spend-reserve.test.ts` "the reply reserve is the model's worst case" (3 tests) | every priced model lists `maxOutputTokens` > 4096 and `replyReserveTokens` returns it; the gpt-4o and claude-opus-5-5 estimates; a priced model with no (or a bad) figure counts 128000. Fail on base: all three. |
| `REQ-agent-298` | `tests/agent.spend-reserve.test.ts` "a call whose worst-case reply would cross a cap asks first" (4 tests) | $0.10 total cap: no owner → `spend-cap` ask naming the worst-case estimate, no fetch, no row; owner → one `spend` / `money` card at that amount, Approve sends the body once and the row settles `actual` at the usage; Deny sends and records nothing; a $0.10 provider cap → SAFE-15 ask naming `provider:llm.test`. Fail on base: all four. |
| `REQ-agent-298` | `tests/agent.spend-reserve.test.ts` "a call whose worst case fits does not ask" (2 tests) | $1 cap with an owner: no card, the in-flight `reserved` row holds the worst case, then `actual` at 7500; the sent body is the built body with no `max_tokens` / `max_completion_tokens`, also in a capped `createTaskExecute` run. Fail on base: the in-flight case. |
| `REQ-agent-298` | `tests/agent.spend-reserve.test.ts` "leaves unpriced models as they were" (2 tests) | unknown-amount card, recorded `unknown`; no owner → unpriced ask; no covering cap → runs unrecorded. Pass on base and branch (unchanged). |
| `REQ-agent-098` | `tests/agent.spend.test.ts` "estimate = request bytes / 3 prompt tokens + the model's worst-case reply" and the pricing shape test | 1000 × 2.5 + 16384 × 10; `priceForModel` carries `maxOutputTokens`. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
