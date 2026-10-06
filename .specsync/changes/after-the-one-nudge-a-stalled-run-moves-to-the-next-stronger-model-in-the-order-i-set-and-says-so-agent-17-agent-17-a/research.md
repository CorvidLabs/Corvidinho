---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: research
---

# Research

- `createTaskExecute` builds one `ModelChain` per run (`modelChain(env,
  tier)`: the tier's entries, resolved, with `index` and `fallbacks`), and
  every model call goes through `callModels` → `callChain` on it, so moving
  `chain.index` moves every later call of the run (rounds and verify
  retries) without a new call path.
- The SAFE-8 / SAFE-14 spend guard wraps `fetch` and reads each request's
  `body.model` and endpoint host, so a call to the stronger model is
  estimated, capped, asked about (unpriced or over a cap) and recorded under
  its own model with no extra wiring; `onUsage` already totals per model
  (AGENT-11), so footers price each model at its own price. The guard's set
  of configured providers is built from every model-list key, which the
  stronger model (an entry of the tier's list) is always in.
- The AGENT-17 stall guard (`createStallNudgeGuard`) is per run across
  attempts; its `next()` returned "nudge" then "stand".
- Delegate / council workers are `task run` children whose env is the
  lead's minus `isWorkerEnvDropped` keys (tokens, Discord, acting identity):
  a new `CORVIDINHO_LLM_*` key reaches them. Council voices are non-ADMIN,
  read-tier advisers with no state-changing tool, so they are never nudged.
- `closingNotesTail` (task-summary) keeps the AGENT-11 fallback note,
  attribution and role notes through clips and Discord's split; a new
  closing note needs to be recognised there to survive them.
- The bun test preload unsets the operator's model config (REQ-cli-262); an
  operator's order would change stall-test outcomes the same way.
