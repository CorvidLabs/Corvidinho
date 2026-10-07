---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: research
---

# Research

- Issue #72 body and comments: steal-from notes (Merlin
  `specs/context-condense/`, `context_budget.rs`: 80% trigger, pinned
  task, summary checkpoint; corvid-agent `server/memory/summarizer.ts`:
  summary prompt shape; ca#2222 / ca#2122: nested history loops that
  dropped tasks). The v0.0.35 rollup comment lists the four gaps this change
  closes (one window, 32,000-char ceiling, conversation-only count,
  extractive summary) and the fifth it leaves (no condensing inside a run's
  tool loop).
- `src/store/conversation.ts` (#296): pure `condenseConversation`,
  `pinnedTurnIndexes`, `formatConversationBlock` (deterministic, so the run
  re-renders the bridge's block exactly), `appendSummary` bounds.
- `src/agent/execute.ts`: `chatCompletions` through the spend-guarded
  fetch is how the GITHUB-9 review hook makes its no-tools helper call on the
  run's call path; `callChain` is the only failover path, so a direct
  `chatCompletions` to the chain's current entry never fails over.
- `src/agent/spend.ts` (AUTONOMY-8.a, #371): every guarded call reserves
  request bytes / 3 prompt tokens plus the model's worst-case reply; no
  `max_tokens` is sent, so the summary call is never cut short either.
- `src/agent/providers.ts` (AGENT-13, #370): every model key is parsed by
  `parseModelEntry`; labels come from `entryLabel`, prices from the model
  id — a stripped suffix leaves all of them unchanged.
- Bun 1.4: `Bun.spawn` takes a `Blob` for stdin; `Bun.stdin.stream()` reads
  it in the child (checked with a 300 KB payload).
