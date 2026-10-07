---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: design
---

# Design

- **Per-model window on the entry.** `parseModelEntry` reads an optional
  `=TOKENS` suffix into `ModelEntry.windowTokens` in every model key (the
  AGENT-13 format #370's order reuses); the suffix is never in the model id
  or label, so prices, fallback notes, the order and the reviewer are
  unchanged. `modelWindowTokens(entry, env)`: own window, else the window on
  another entry naming the same `kind:model` (another tier's key or the
  order; one window per model wherever it is listed), min 1024, else
  `CORVIDINHO_LLM_CONTEXT_TOKENS`, else 8192 — today's behaviour by default.
  No new env var.
- **Condense where the whole prompt and the model call are.** The bridge
  (Discord chat and ask answers, WATCH) no longer folds: it replays the
  conversation whole and hands the run the same `ConversationReplay`. The
  run (`createConversationCondenser`, `src/agent/condense.ts`) finds the
  block in its task (it renders the replay with the same pure
  `formatConversationBlock`), measures system prompt + user message + tool
  schemas before an attempt's first model call (`condensedTask` in
  `execute.ts`, tool loop and read tier), and at 80% of the current chain
  entry's window folds with the existing `condenseConversation` (new
  `fixedChars` for the rest of the prompt).
- **The model writes the summary.** One no-tools `chatCompletions` call to the
  chain's current entry through the run's spend-guarded fetch (counts toward
  every cap, AUTONOMY-8.a reserve, usage in the footer), never `callChain`
  (no failover). Bounded prompt (`summaryMessages`, half the window); the
  pinned task and latest instruction are never folded so never in it. The
  reply becomes one `- Summary: …` line (scrubbed, defanged, fenced
  `model-summary` when its input held a fence or the run is a non-owner's
  role session, SAFE-12) sized to the room left under
  80% and at most half the summary cap. `appendSummary` keeps that line ahead
  of later extractive points (turn cap, retention bound). Failure (HTTP,
  timeout, network, malformed / empty, no key) → extractive summary +
  `[operator]` line; a spend-cap stop or abort ends the attempt.
- **Transport.** `task run --task-stdin` reads `{ task, conversation? }` on
  stdin (16 MiB sanity bound): the argument ceiling no longer caps the
  budget; the only bound on what reaches the model is its window. Runs
  without a conversation keep `--task`. Additive result field
  `TaskResult.conversation`; no protocol bump (bridge and binary ship
  together from one checkout; an older binary would not refuse the unknown
  flag — it would run with no task text — so a mixed install is not
  supported, as with `--here`).
- **Keeping the report.** Clients validate it against the replay they sent
  (`condenseReportFromUnknown`: scrubbed, bounded, in-range, never pinned).
  `SessionStore.applyCondensed` drops the folded turn objects, stores the
  summary (SESSION-6, so SESSION-3.a resumes from it) and rewrites the rows;
  WATCH saves `withoutFolded` turns with the summary. Extractive reports are
  logged. A report with an empty summary is refused, and `applyCondensed`
  leaves a thread cleared while its run ran (an approved forget-me,
  MEMORY-ACL-6) alone, so no summary of forgotten turns is stored again.
- **Not built (pending Leif):** condensing inside one attempt's tool loop
  (tool messages are not conversation turns; it does not fall out of this
  mechanism); re-measuring after a failover or stronger-model move to a model
  with a smaller window (the prompt condensed for the model the run started
  on goes to it as is, and a later attempt reuses that outcome); the session
  turn cap (200) and the retained-record bound (20 turns) still fold
  extractively.
