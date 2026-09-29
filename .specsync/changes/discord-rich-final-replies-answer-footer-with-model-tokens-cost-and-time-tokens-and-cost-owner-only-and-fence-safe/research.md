---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: research
---

# Research

- Usage data: `createTaskExecute` accumulates provider `usage` across
  rounds and attempts and the runner streams it as `usage` frames
  (`promptTokens` / `completionTokens` / `totalTokens`, running totals,
  REQ-agent-073). `collectTaskRunStream` kept only `totalTokens` (for the
  live status), so the prompt / completion split needed to price a run never
  reached the bridge. Delegate / council workers are separate processes whose
  usage is not in the parent's frames.
- Price: `MODEL_PRICES_USD_PER_MTOK` / `priceForModel` (exact model id,
  standard list prices, no cache discounts) and `costMicroUsd` (rounds up, so
  any priced token costs at least 1 micro-USD) in `src/agent/spend.ts`;
  `formatUsd` prints 4 decimals below a cent, so a known cost never prints
  `$0.00`. An unpriced model is exactly the SAFE-16 "unknown" case.
- Model: the bridge already shows `loadLlmEnv(process.env).model`; the child
  inherits the same env and no `--tier`, so it runs that model.
- Owner: `resolvePermissionLevel` makes only the configured owner ADMIN
  (IDENTITY-2); `isOwnerDiscord(owner, userId)` is the direct "owner's own
  run" check and needs no reordering of the spawn-time ADMIN re-check.
- Limits: Discord message content 2000 characters, embed description 4096,
  embed footer 2048; a user mention inside an embed renders but never
  notifies. A code fence left open in one message does not continue in the
  next, so each message needs balanced fences. The result frame already caps
  `summary` at 4000 (scrubbed first, role note kept), so a Discord answer is
  at most three messages.
- Paths that deliver an answer: chat collapse / fallback reply, button-pick
  collapse / fallback reply (`bridge.ts`), `finishSlashWithThinking`
  collapse / deferred-reply fallback, and `finishSlashWithOwnerNotice`'s
  notice re-edit (`spend-post.ts`). `withSpendWarningPost` /
  `appendPostLine` cut the body to 1900 when a SAFE-8 line is appended.
