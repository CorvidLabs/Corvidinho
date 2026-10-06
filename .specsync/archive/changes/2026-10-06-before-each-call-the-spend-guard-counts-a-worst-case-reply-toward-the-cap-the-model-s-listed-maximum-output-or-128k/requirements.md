---
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
artifact: requirements
---

# Requirements

- AUTONOMY-8.a (captured in this change with `hi`, `hi/autonomy.md`, Leif
  2026-09-28 interview round 16): "Before each call it counts a worst-case
  reply toward the cap, so it asks before a long reply could take spend past
  it; replies are never cut short." Built in full here.
- Kept: AUTONOMY-8, SAFE-8 / SAFE-8.a (one call per Approve, at the amount
  shown), SAFE-14 / SAFE-14.a / SAFE-15 (every cap; owner-only amounts),
  SAFE-16 / SAFE-16.a (unknown prices ask on the card, no price override),
  SAFE-18..20 (the card and its code), AGENT-11 (a cap stop never falls back).
- Added: REQ-agent-298 (worst-case reply reserve). Modified: REQ-agent-098
  (the estimate's reply part, plus one acceptance bullet).
- No env var, config key, flag, NDJSON field, protocol, card text or schema
  change.
