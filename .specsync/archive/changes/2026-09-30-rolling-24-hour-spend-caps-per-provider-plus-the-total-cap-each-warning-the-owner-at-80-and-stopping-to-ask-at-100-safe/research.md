---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: research
---

# Research

Where each cap-relevant piece lived on main (1fa6c02, then 7090656 after #325):

| Piece | Main | This change |
|---|---|---|
| Cap setting | `parseSpendCap` (total only) | `parseSpendCaps` (total + `parseProviderCapList`, keys checked against `configuredProviderIds`) |
| Provider id | `providerId` = endpoint host (#320); the ledger records the request URL host | the same host is the cap key, so no mapping table |
| Ledger window | `window(now)` over every call | `window(now, provider?)`, index `(provider, ts)` |
| Reserve | total check in one IMMEDIATE tx | total and provider checked in the same tx, `trips` names each |
| 80% / cap ping state | `spend_alerts` keyed by cap value | keyed by (scope, cap value); `scope` added by ALTER like `delivered_at` |
| Owner ping | `claimCapPing()` for the total cap value | `claimCapPing(scopes)` per tripped scope; scopes from `ask.spendScopes` or the stored question's marker |
| Schedule ask persistence | `schedule_runs.ask_reason` / `ask_question` only | unchanged (no schema bump); `spendScopesOf` reads the "Stopped at cap" marker |
| AGENT-11 fallback (#325) | `SpendCapRefusal` → failure null → no fallback | every cap stop is still a `SpendCapRefusal` |
| Doctor / `/status` | one spend line | `spend` + `spend provider:<id>`; owner status one line per cap |

`spend_alerts` is module-owned (no `SCHEMA_VERSION` bump; main is v15). The
`scope` value is derived from the scrubbed ledger provider, so it is
scrubbed on write and listed in `SCRUB_TARGETS`; `rescrubDatabase` selected
listed columns blindly, which would fail on a `spend_alerts` created by an
older build before its ALTER ran, so it now skips missing columns.

The m34 plan (pr-spend-caps-b) also named `stop` rows in `spend_alerts`.
They were for the bridge to learn about stops from runs it did not start
(WATCH, the daemon); that delivery is the spend-card slice, and the per-cap
ping only needs the scope, which the ask carries (or its stored question
names), so no `stop` rows are added.
