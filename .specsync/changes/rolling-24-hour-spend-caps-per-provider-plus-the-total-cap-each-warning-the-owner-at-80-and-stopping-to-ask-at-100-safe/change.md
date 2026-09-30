---
id: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
state: approved
type: feature
base_commit: 7090656ae33784df24c49857987e7b878e356ad9
---

# Rolling 24-hour spend caps per provider plus the total cap, each warning the owner at 80% and stopping to ask at 100% (SAFE-14, SAFE-15): CORVIDINHO_PROVIDER_SPEND_CAPS_USD (provider=USD keyed on the configured provider id; a malformed or unknown key stops every call, value never echoed) next to CORVIDINHO_DAILY_SPEND_CAP_USD (the total cap); every provider call is recorded while any cap is set; SpendLedger.window(now, provider?) with a (provider, ts) index; reserve() checks the total and the call's provider cap in one IMMEDIATE transaction and names each tripped scope (total, provider:<id>) in owner-only text; spend_alerts gains a scope column (idempotent ALTER, scrubbed) so each cap warns once per crossing and pings once per episode; a cap stop is never a model failure; doctor and the owner's /status show each cap

## Intent

Rolling 24-hour spend caps per provider plus the total cap, each warning the owner at 80% and stopping to ask at 100% (SAFE-14, SAFE-15): CORVIDINHO_PROVIDER_SPEND_CAPS_USD (provider=USD keyed on the configured provider id; a malformed or unknown key stops every call, value never echoed) next to CORVIDINHO_DAILY_SPEND_CAP_USD (the total cap); every provider call is recorded while any cap is set; SpendLedger.window(now, provider?) with a (provider, ts) index; reserve() checks the total and the call's provider cap in one IMMEDIATE transaction and names each tripped scope (total, provider:<id>) in owner-only text; spend_alerts gains a scope column (idempotent ALTER, scrubbed) so each cap warns once per crossing and pings once per episode; a cap stop is never a model failure; doctor and the owner's /status show each cap

## Affected Canonical Specs

- `agent`
- `cli`
- `discord`

## Acceptance Criteria

- With CORVIDINHO_PROVIDER_SPEND_CAPS_USD set to provider=USD entries keyed on configured provider ids (endpoint hosts from providerId, every chain entry of every tier key), a provider call past its provider's rolling 24 h cap, or past the total CORVIDINHO_DAILY_SPEND_CAP_USD, is not sent: the attempt ends blocked with a spend-cap ask whose owner-only question names each tripped scope (total, provider:<id>) with its spend and cap and the setting to raise, carries spendScopes, and whose summary is the generic 'Work is paused for budget.'; other providers' calls still run and are recorded while any cap is set. A malformed entry, a duplicate, or a key naming no configured provider makes the whole setting invalid: every call stops and asks, before the ledger opens, and the value is never echoed. An unpriced model stops under a cap that covers its call and runs unrecorded when none does. At 80% of each cap one warning per crossing is recorded per (scope, cap value) in spend_alerts (new scope column by idempotent ALTER, scrubbed, in SCRUB_TARGETS; re-scrub copes with a table that lacks it) and DMed to the owner one line per cap; each cap's stop pings the owner once per its own episode (scopes from the ask, or from the stored question's 'Stopped at cap' marker). SpendLedger.window(now, provider?) and an index on (provider, ts); reserve() checks both caps in one IMMEDIATE transaction. doctor prints 'spend' plus one 'spend provider:<id>' line per cap; the owner's /status shows a line per cap; anyone else only 'Spend: Work is paused for budget.' while any cap is reached. A cap stop is a SpendCapRefusal, never a model failure, so no fallback routes around it. The new tests fail on main's sources and pass on the branch; no schema version bump.

## No-spec Rationale

Not applicable
