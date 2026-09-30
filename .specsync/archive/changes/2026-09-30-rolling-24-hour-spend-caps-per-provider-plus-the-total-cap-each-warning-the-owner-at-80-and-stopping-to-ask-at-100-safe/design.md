---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: design
---

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
