---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: testing
---

# Testing

Fixture tests only: mocked fetch, in-memory or temp SQLite, one spawned
`corvidinho doctor` with fake keys; no network, no real key, no Discord.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-114` | `tests/agent.spend-caps.test.ts` ("CORVIDINHO_PROVIDER_SPEND_CAPS_USD (SAFE-14)") | Configured ids are every chain entry's host; off / total / providers / both; eleven malformed lists and an unknown key are invalid as a whole; both bad name both. Fail on base (file cannot load). |
| `REQ-agent-114` | `tests/agent.spend-caps.test.ts` ("the ledger tracks spend against each cap") | Per-provider window; `(provider, ts)` index; `reserve` names total, provider or both (`total` first) and reserves a provider under its own cap. |
| `REQ-agent-114` | `tests/agent.spend-caps.test.ts` ("the capped fetch stops and asks at 100% of each cap") | Provider stop with no fetch, scopes, SAFE-15 question and marker, generic summary; other provider sent and recorded; total still applies; both named; bad setting stops every provider without a DB or echo; unpriced covered stops, uncovered runs unrecorded; 80% once per crossing per cap with scopes; `createTaskExecute` with a two-model chain at a $0 head cap makes no provider call (no AGENT-11 fallback). Probe on base: the call is sent. |
| `REQ-agent-114`, `REQ-discord-098` | `tests/agent.spend-caps.test.ts` ("delivery keeps each cap apart") | One warning per cap from the outbox with current spend, release returns both, a cap under 80% stays pending; one DM line per cap; per-cap ping episodes and release; stored question-only stops keep their caps (`spendScopesOf`); `askFromUnknown` scope validation; `askPingKey` per provider scope; scoped warning frame; public post names no scope or amount. |
| `REQ-agent-114`, `REQ-discord-098` | `tests/agent.spend-caps.test.ts` ("spend_alerts gains its scope column in place") | Older table gains `scope` (`total`), re-scrub before the ALTER does not throw; `SCRUB_TARGETS` lists it, stored and re-scrubbed redacted. |
| `REQ-agent-114`, `REQ-cli-098`, `REQ-discord-098` | `tests/agent.spend-caps.test.ts` ("doctor and the owner's /status show each cap") | Snapshot `providers`; doctor `spend` + `spend provider:<id>` (exact detail, `warn` at 80% and at the cap); owner `/status` lines per cap; public paused line while any cap is reached; provider-only `spend` line without amounts; unpriced flagged only when covered; invalid provider setting named not echoed; the real CLI doctor prints the provider line. |
| `REQ-agent-098` | `tests/agent.spend-ask.test.ts`, `tests/agent.spend.test.ts` | The invalid total's snapshot carries `keys`; a refused reservation carries `trips`; every total-cap test passes unchanged (text, warnings, outbox, CLI). Fail on base (2 updated assertions). |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts` ("bot run settings … do not reach the suite") | A child `bun test` with `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` set sees no such key. Fail on base (the probe reports it). |
| `REQ-discord-098` | `tests/discord.spend.test.ts`, `tests/discord.spend-dm.test.ts`, `tests/scheduler.ask-outbox.test.ts`, `tests/discord.collapsed-ping.test.ts` | SAFE-14.a surfaces unchanged with the total cap (no regression). |

## Automated coverage

- `tests/agent.spend-caps.test.ts` (24 tests).
- Unchanged suites that cover the touched files still pass:
  `tests/agent.spend.test.ts`, `tests/agent.spend-ask.test.ts`,
  `tests/agent.fallback.test.ts`, `tests/agent.providers.test.ts`,
  `tests/discord.spend.test.ts`, `tests/discord.spend-dm.test.ts`,
  `tests/scheduler.ask-outbox.test.ts`, `tests/store.scrub.test.ts`,
  `tests/preload.operator-data-dir.test.ts`, and the full `bun test`.
