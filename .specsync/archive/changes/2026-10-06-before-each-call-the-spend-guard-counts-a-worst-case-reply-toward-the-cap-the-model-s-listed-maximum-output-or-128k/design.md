---
change: before-each-call-the-spend-guard-counts-a-worst-case-reply-toward-the-cap-the-model-s-listed-maximum-output-or-128k
artifact: design
---

# Design

- **Where the figure lives.** `ModelPrice` gains an optional
  `maxOutputTokens` and every `MODEL_PRICES_USD_PER_MTOK` entry lists its
  model's maximum output. The price table already decides which calls are
  priced, so the worst case is known exactly where an estimate is made; no
  parallel table, no config and no AGENT-13 field.
- **The reserve.** `replyReserveTokens(price)` returns the listed figure when
  it is a positive whole number, else `REPLY_RESERVE_DEFAULT_TOKENS`
  (128,000 — the largest listed maximum, 31× the old 4096). The default is
  only a guard for a future entry that omits the figure.
- **The estimate.** `estimateCallMicroUsd(price, bytes)` is prompt (bytes / 3)
  at the input price plus `replyReserveTokens(price)` at the output price.
  Its callers are unchanged: the guarded fetch reserves it in the IMMEDIATE
  ledger transaction against every covering cap; past a cap the existing
  card path (`passOnCard` → `reserveApproved` at the card's amount) or the
  `spend-cap` ask runs as before. `REPLY_RESERVE_TOKENS` is replaced by
  `REPLY_RESERVE_DEFAULT_TOKENS`.
- **No cut.** Nothing adds `max_tokens`; the guard passes the request body
  through untouched. After the reply the row settles to the reported usage
  (or stays at the estimate without usage), as before.
- **Effect.** A call holds its worst case while in flight, so with small caps
  the card comes on more calls (one `claude-opus-5-5` call holds about $2.56
  for its reply; a $1 cap asks on every such call). That is the decision
  ("the card comes earlier"); amounts stay owner-only (SAFE-14.a).
- **Not touched:** unpriced models (no estimate, SAFE-16.a card), flat-priced
  tools (`reserveFlatSpend`), the card text, the 80% warning (it reads
  settled spend plus in-flight reservations, as before).
