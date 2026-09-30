---
change: rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe
artifact: requirements
---

# Requirements

Confirmed HI (captured on main from Leif's 2026-09-28 interview, round 4; no
new capture in this change): SAFE-14, SAFE-15; related SAFE-8, SAFE-14.a,
SAFE-16.

Canonical requirements changed (see deltas):

- Added **REQ-agent-114**: `CORVIDINHO_PROVIDER_SPEND_CAPS_USD` (provider=USD
  keyed on the configured provider id; malformed or unknown key = the whole
  setting invalid, every call stops and asks, value never echoed); every cap
  optional; every priced call recorded while any cap is set; `window(now,
  provider?)` + `(provider, ts)` index; `reserve` checks the total and the
  call's provider cap in one IMMEDIATE transaction and names each tripped
  scope; the stop is a `SpendCapRefusal` (never a model failure, no AGENT-11
  fallback); per-scope 80% warnings and cap-ping episodes in `spend_alerts`
  (`scope` column); `spendScopes` on the ask and `spendScopesOf`; doctor and
  owner `/status` per cap; public text unchanged (SAFE-14.a).
- Modified **REQ-agent-098**: the total cap is SAFE-14's `total` scope; the
  no-cap path now means neither setting; the invalid snapshot carries `keys`
  and a refused reservation `trips`.
- Modified **REQ-cli-098**: doctor's `spend` line with provider caps only and
  one `spend provider:<id>` line per cap; help and `.env.example` list the new
  setting.
- Modified **REQ-cli-262**: the test preload also unsets
  `CORVIDINHO_PROVIDER_SPEND_CAPS_USD`.
- Modified **REQ-discord-098**: `spend_alerts.scope` scrubbed and in
  `SCRUB_TARGETS` (re-scrub skips a column an older table lacks); per-cap owner
  ping episodes and schedule ping keys; one DM warning line per cap; owner
  `/status` per cap; public line never names the cap.
