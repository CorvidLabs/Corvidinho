# Lesson bundle — rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Rolling 24-hour spend caps per provider plus the total cap, each warning the owner at 80% and stopping to ask at 100% (SAFE-14, SAFE-15): CORVIDINHO_PROVIDER_SPEND_CAPS_USD (provider=USD keyed on the configured provider id; a malformed or unknown key stops every call, value never echoed) next to CORVIDINHO_DAILY_SPEND_CAP_USD (the total cap); every provider call is recorded while any cap is set; SpendLedger.window(now, provider?) with a (provider, ts) index; reserve() checks the total and the call's provider cap in one IMMEDIATE transaction and names each tripped scope (total, provider:<id>) in owner-only text; spend_alerts gains a scope column (idempotent ALTER, scrubbed) so each cap warns once per crossing and pings once per episode; a cap stop is never a model failure; doctor and the owner's /status show each cap
- **Kind**: Feature
- **Specs**: agent, cli, discord
- **Paths**: src/agent/spend.ts, src/agent/spend-alerts.ts, src/agent/spend-notice.ts, src/agent/spend-outbox.ts, src/agent/types.ts, src/agent/ask.ts, src/agent/index.ts, src/discord/ask-ping.ts, src/discord/spend-post.ts, src/discord/spend-dm.ts, src/store/scrub.ts, src/cli.ts, .env.example, tests/agent.spend-caps.test.ts, tests/agent.spend.test.ts, tests/agent.spend-ask.test.ts, tests/preload.ts, tests/fixtures/preload-probe.ts, tests/preload.operator-data-dir.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, docs/DAEMON.md, docs/BOX-UPDATE.md, specs/agent/agent.spec.md, specs/agent/requirements.md, specs/agent/testing.md, specs/cli/cli.spec.md, specs/cli/requirements.md, specs/cli/testing.md, specs/discord/discord.spec.md, specs/discord/requirements.md, specs/discord/testing.md
- **Acceptance**: With CORVIDINHO_PROVIDER_SPEND_CAPS_USD set to provider=USD entries keyed on configured provider ids (endpoint hosts from providerId, every chain entry of every tier key), a provider call past its provider's rolling 24 h cap, or past the total CORVIDINHO_DAILY_SPEND_CAP_USD, is not sent: the attempt ends blocked with a spend-cap ask whose owner-only question names each tripped scope (total, provider:<id>) with its spend and cap and the setting to raise, carries spendScopes, and whose summary is the generic 'Work is paused for budget.'; other providers' calls still run and are recorded while any cap is set. A malformed entry, a duplicate, or a key naming no configured provider makes the whole setting invalid: every call stops and asks, before the ledger opens, and the value is never echoed. An unpriced model stops under a cap that covers its call and runs unrecorded when none does. At 80% of each cap one warning per crossing is recorded per (scope, cap value) in spend_alerts (new scope column by idempotent ALTER, scrubbed, in SCRUB_TARGETS; re-scrub copes with a table that lacks it) and DMed to the owner one line per cap; each cap's stop pings the owner once per its own episode (scopes from the ask, or from the stored question's 'Stopped at cap' marker). SpendLedger.window(now, provider?) and an index on (provider, ts); reserve() checks both caps in one IMMEDIATE transaction. doctor prints 'spend' plus one 'spend provider:<id>' line per cap; the owner's /status shows a line per cap; anyone else only 'Spend: Work is paused for budget.' while any cap is reached. A cap stop is a SpendCapRefusal, never a model failure, so no fallback routes around it. The new tests fail on main's sources and pass on the branch; no schema version bump.

## Evidence

- Verification commit: `e806f3da3ac5f54d93037b64f70157537b7a3f10`
- Base commit: `7090656ae33784df24c49857987e7b878e356ad9`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

Issue #98 (M4 "Safe autonomy"): rolling 24 h spend caps per provider and in
total, warning at 80% and asking at 100%. #160 built the total cap
(`CORVIDINHO_DAILY_SPEND_CAP_USD`, SAFE-8 as amended) and #317 made spend
owner-only (SAFE-14.a: amounts and cap stops go to the owner by DM, everyone
else sees "Work is paused for budget."). The v0.0.36 rollup on #98 left
SAFE-14 and SAFE-15 partial: one total cap, no per-provider cap, so there is
nothing to warn or stop at per provider.

Confirmed HI, already captured on main from Leif's 2026-09-28 interview
(round 4, /home/user/coord/interview-2026-09-28.md); nothing new is captured
here:

- **SAFE-14** "It keeps rolling 24-hour spend caps per provider plus a total
  cap, and tracks spend against each."
- **SAFE-15** "It warns at 80% of a cap and stops and asks at 100%, for each
  cap."

Must not regress: SAFE-14.a (#317), SAFE-16 (unknown price stays unknown),
SAFE-8, DISCORD-15.a. #320 gave `providerId` (the endpoint host) and #325
(landed during this change, base moved to 7090656) the AGENT-11 fallback
chain, which already treats `SpendCapRefusal` as no model failure; this
change keeps every cap stop a `SpendCapRefusal` and does not touch
`src/agent/execute.ts` or `src/agent/shell-gate.ts`.

Out of scope: the Approve card that continues past a cap (spend-card: SAFE-8,
SAFE-19 money, the "asks on an Approve card" half of SAFE-15), unknown-price
ledger rows (spend-caps-c), WATCH cap stops reaching the owner (spend-card),
#232 / #233.

## From the change's design.md

# Design

- `src/agent/spend.ts`: `parseProviderCapList`, `configuredProviderIds`,
  `parseSpendCaps` (`SpendCaps`); `SpendLedger.window(now, provider?)`,
  `reserve({ …, capMicroUsd?, providerCapMicroUsd? })` → `trips`,
  `noteWarning({ …, provider? })`; `createSpendGuard` reads all caps: invalid
  → stop before the ledger opens; unpriced + covered → stop naming the
  covering scope; unpriced + uncovered → sent unrecorded; else reserve against
  both, stop with `spendCapReachedAsk({ estimateMicroUsd, trips })`, settle,
  then note each applicable cap's warning. `readSpendSnapshot` adds
  `providers` and an optional total; `spendDoctorChecks`.
- `src/agent/spend-notice.ts`: scope helpers (`TOTAL_SPEND_SCOPE`,
  `providerSpendScope`, `providerOfSpendScope`, `isSpendScope`,
  `spendScopesOf`), `PROVIDER_SPEND_CAPS_ENV`, per-scope warning line, the
  multi-trip ask with the fixed `Stopped at cap(s): …` marker, the invalid
  ask naming the bad setting(s), per-provider doctor and owner status lines;
  `spendPaused` true while any cap is reached; public text unchanged.
- `src/agent/spend-alerts.ts`: `scope` column (CREATE + idempotent ALTER,
  default `total`), every armed / rearm / warn / cap query per scope;
  `claimSpendWarnings` groups by scope and returns `warnings`.
- `src/agent/spend-outbox.ts`: `takeWarning` → `warnings` (one per cap);
  `claimCapPing(scopes?)` claims each scope's episode (cap value from the
  bridge's env).
- `src/agent/types.ts`: `SpendWarning.scope?`, `HumanAsk.spendScopes?`.
  `src/agent/ask.ts`: `askFromUnknown` keeps well-formed `spendScopes`.
- `src/discord/spend-post.ts` / `ask-ping.ts`: `askPingOwner` and
  `askPingKey` use `spendScopesOf`. `src/discord/spend-dm.ts`: one DM line per
  cap. `src/store/scrub.ts`: `spend_alerts.scope` target; missing columns
  skipped. `src/cli.ts`: doctor prints every spend line; help lists the var.
- No change to `src/agent/execute.ts` (#325's fallback loop) or
  `src/agent/shell-gate.ts`; no schema version bump; no new table or slash
  command; `.env.example` documents the one new optional env var.

Design choices pending Leif (conservative where the confirmed text leaves a
question; see /home/user/coord/m34-defaults.md spend-caps rows):

1. Cap key = the configured provider id (endpoint host, `providerId`),
   matched case-insensitively; every entry of every model key counts as
   configured (fallback entries included, usable or not).
2. A blank entry, trailing comma or duplicate key makes the whole setting
   invalid (fail closed: every call stops and asks until fixed).
3. An unpriced model on a provider no cap covers (provider caps only, no total)
   is sent and not recorded — interview round 13 ("with no cap covering them
   they just run"); under any covering cap it stops and asks as today. Unknown
   ledger rows are spend-caps-c.
4. A call past two caps is one stop whose ask names both; the owner ping is
   claimed for each cap whose episode has not pinged yet.
5. The 80% warnings of several caps go in one owner DM, one line per cap.
6. Anyone but the owner sees "Spend: Work is paused for budget." while any cap
   is reached, even when other providers still run; never which cap.
7. With provider caps only, doctor's `spend` line shows no total amount (an
   uncovered unpriced call is not recorded, so a total would understate).
8. No `stop` rows: per-cap pings use the ask's scopes or its stored
   question's marker.
9. The 100% stop keeps today's operator-action ask (raise or remove the cap,
   or wait); the Approve card is the spend-card PR, so SAFE-15 is partial.

## From the change's testing.md

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

## Where these lessons go

- `specs/agent/context.md`
- `specs/cli/context.md`
- `specs/discord/context.md`
