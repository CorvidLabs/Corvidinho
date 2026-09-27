---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: research
---

# Research

- Readers of `session.pendingAsk`: `bridge.ts` (thin-ack/cancel gate,
  free-text answer, post-run store/clear, `onComponent`),
  `command-handlers/session.ts` and `work.ts` (store a free-text ask on a new
  session), tests. Only `onComponent` needed a by-askId lookup; the others
  act on the newest ask, which `pendingAsk` still is.
- `askFromUnknown` returns undefined for arrays, so a downgraded build reads
  a multi-ask row as no pending ask (fail safe, no crash).
- Open PR #232 inserts actor + mute/rate gates between the channel gate and
  `const pending = …` in `onComponent`; this change edits the lookup and that
  line only (textual neighbour, no behavioural overlap). PR #233 is unrelated
  (plugins SAFE-3).
- No open issue tracks SESSION-MULTI-3 (GitHub issue search).
