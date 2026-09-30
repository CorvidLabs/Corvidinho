---
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
artifact: design
---

# Design

- **Chain in providers.ts.** `modelChain(env, tier)` resolves the tier's
  entries once; `callChain(chain, fn, onFallback)` calls the current entry and,
  on a result with a `ModelFailure`, records a `ModelFallback` hop, calls
  `onFallback` and moves `index` on — at once, no retry. `failure: null` (not a
  model failure) or the last entry returns as is. A next entry with no key is
  a `no-key` failure without a call. Reasons are fixed short strings
  (`modelFailureReason`), never provider output. Pure helpers for the Text
  line, the closing note, the log line, the footer label and child-result
  validation live next to it.
- **Transport.** `chatCompletions` takes a `ResolvedProvider` and returns a
  `Completion` with `failure`: `http` (any status), `network`, `timeout`,
  `malformed` (not JSON / no assistant message); `null` for
  `SpendCapRefusal` or the caller's abort. `callModels` wraps it in
  `callChain` and reports `onModel`. The image-refusal retry sits inside the
  per-model call, so it runs before a failover.
- **Run state.** One chain, the `fallbacks` list and per-model usage live in
  the `createTaskExecute` closure (like `injection` / `roleRefused`), so every
  round and attempt shares them; nothing is written anywhere. The run wrapper
  adds the note after the SAFE-13 note and before the role note (which stays
  last). `closingNotesTail` teaches `clipKeepingRoleNote` and
  `splitDiscordMessage` to keep both notes.
- **Reporting.** `onModelFallback` / `onModel` / `onUsage(…, { model, byModel
  })`; `task run` puts `model`, `usageByModel`, `modelFallback` on the result
  and `usageFrame(u, detail)` adds `model` / `byModel` (optional fields,
  protocol 2 kept: the bridge tolerates their absence).
- **Workers.** `runDelegateChild` validates the worker's `modelFallback`;
  `runCouncil` merges its voices'; the plugins put it in `data`; the lead's
  loop reports it via `onWorkerFallback` with `via`, deduped.
- **Surfaces.** Discord and WATCH spawn clients validate the new result
  fields and call `onModelFallback` (default one `[discord]` / `[watch]`
  `llm.fallback` warn line); the daemon passes its structured logger. The
  footer uses `answerModelFor` (`b (fell back from a)`, own hops only) and
  `answerSpendFor(usage, model, usageByModel)` (each model at its own price,
  one unpriced → unknown). No DM.
- **Alternatives rejected.** Retry with backoff (m34 default: none); a stored
  "dead model" list (no persistence); failing over on a cap stop (round 4);
  bumping the protocol (additive optional fields); an owner DM (not
  confirmed); a head whose key is missing falling over silently (kept as the
  AGENT-10 notice — see design choices).
