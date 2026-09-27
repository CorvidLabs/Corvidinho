---
change: safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a
artifact: requirements
---

# Requirements

1. No cap set: provider fetch untouched, no ledger, no DB opened.
2. Cap set: every provider call is priced, its estimate reserved atomically in
   the shared DB, and the call refused before sending when rolling 24 h spend
   + estimate would exceed the cap (SAFE-8).
3. Reservations settle to provider-reported cost; missing usage or a network
   error keeps the estimate; an HTTP error reply counts 0.
4. Unpriced model or invalid cap: every call refused (fail closed).
5. Ledger free-text columns (provider, model) are scrubbed and re-scrubbable
   (SAFE-6).
6. `doctor` shows spend vs cap when a cap is set, never failing doctor
   (AUTONOMOUS-8).
