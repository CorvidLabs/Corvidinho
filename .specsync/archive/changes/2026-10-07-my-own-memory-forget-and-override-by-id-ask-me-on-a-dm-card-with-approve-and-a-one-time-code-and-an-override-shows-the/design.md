---
change: my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the
artifact: design
---

# Design

- `src/memory/card.ts`: `memoryCardFields(op, row, content, surface)` builds
  title / action / target / amount / text; `askMemoryCard` records one
  `approval_requests` row (kind `memory`, class `destructive`, requester the
  owner, waiter this process, 5 min TTL), then `waitForDecision` (abort signal
  honoured; the idle watchdog is paused by the store) and `consume` once.
  Test seam `setMemoryCardTestHooks` (TTL, poll, onRequest) like the must-ask
  gate's.
- `plugins/memory/commands.ts`: `ownerCard` replaces `twoPhase`. Order: argv
  identity refusal → no role session (local CLI) ⇒ bridge line → no actor ⇒
  NO_ACTOR → usage → not owner ⇒ opaque `not authorized` (unchanged for
  non-owners) → `--confirm` ⇒ no-tokens line → not a conversation ⇒ bridge
  line → row lookup → card + wait → on an approval used once: owner re-check,
  then one IMMEDIATE transaction that applies only if the row is the same,
  not forgotten and `updated_at` unchanged.
- `src/discord/approval-cards.ts`: `memoryApprovalKind` =
  `storedApprovalKind` (destructive, audit `memory`); the bridge registers it.
  Approve only records the decision (the waiting run acts), as for
  `mustask` / `spend`; a gone waiter closes the card as a no.
- Why in-process wait (not act-in-bridge): the run that asked keeps the
  exact op, id and text, reports the outcome in the same conversation, and
  no new table is needed (the request row holds only what the card shows).
- Removed: `src/memory/confirm.ts` (+ test); the Discord spawn now always
  clears `CORVIDINHO_ACTING_CONFIRM_TOKENS` (like WATCH) instead of passing
  tokens from `humanText`; `humanText` stays on `AgentRunChatOpts` (callers
  and fixtures record it) but the spawn reads nothing from it.
- Bridge-delivery check: a conversation run (`CORVIDINHO_DISCORD_REPLY_CHANNEL_ID`)
  the bridge started; `bridgeRunning` (the WATCH mark) is not used because
  the bridge sets it only with the scheduler on, while the card engine runs
  either way.
