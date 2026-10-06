---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: design
---

# Design

- Config: one optional env key `CORVIDINHO_LLM_MODEL_ORDER`
  (`MODEL_ORDER_ENV`), parsed with the model list's own `parseModelChain`
  (same `kind:model` entries), weakest first. Unset / empty = no order =
  today's behaviour (the nudge, then the reply stands). No TOML key, no
  per-entry rank syntax: the existing model-list keys keep their exact
  grammar.
- `src/agent/providers.ts`: `strongerModel(chain, order)` (pure) and
  `moveToStronger(chain, order)`: the next entry after the chain's current
  model in the order that the chain holds (the run's tier's list), is
  usable (key set) and is not a `from` of the chain's failovers; later order
  entries in turn. Stays with `no-order` / `unordered` / `top` /
  `unavailable`. `STRONGER_MODEL_NOTE_PREFIX`, `strongerModelNote`,
  `withStrongerModelNote` for the user-facing closing line.
- `src/agent/loop-guards.ts`: the guard's `next()` gives `"nudge"` once,
  then `"escalate"` until `moved()`, then `"stand"`; `stallMovedNote` and
  `stallStandsNote(kind, why)` (operator lines naming why it stays).
- `src/agent/execute.ts`: `ModelCalls.escalate(kind)` backed by
  `moveToStronger` on the run's chain; it records the move for the summary
  note (added after the AGENT-11 fallback note). In `runToolLoop`'s stall
  branch, `"escalate"` with a move pops the stalled assistant message,
  restores the text that stood before it, emits the operator line, and
  continues the loop (round limit +1) so the same request goes to the
  stronger model: one nudge in total, no tool round used.
- `src/agent/task-summary.ts`: `closingNotesTail` keeps the
  `(stronger model: …)` line after the fallback note.
- `src/cli.ts` help, `.env.example`, README and the go-live / discord docs
  document the key; `tests/preload.ts` unsets it.

## Design choices pending Leif

Most conservative options consistent with AGENT-17 / AGENT-17.a, not Leif's
decisions:

1. Where the order lives: a separate optional key
   `CORVIDINHO_LLM_MODEL_ORDER` in the model list's own entry format,
   rather than new syntax inside `CORVIDINHO_LLM_MODEL` (which would change
   that key's grammar for every existing box).
2. One order for all tiers, but a run only moves to a model its own tier's
   list holds (another tier's model, a model without its key, or one that
   failed in the run is skipped as unavailable).
3. A current model that is not in the order never moves (it is not known to
   be weaker than anything).
4. At most one move per run; if the stronger model also stalls, its reply
   stands.
5. The stalled reply is dropped and the stronger model gets the same request
   (ending with the one nudge) instead of a second harness message.
6. After the move, a failure of the stronger model still falls back the
   AGENT-11 way (next entry in the fallback list, which may be weaker or
   unordered); escalation itself never picks one.
7. The notice is one closing line on the answer (like AGENT-11's) plus an
   `[operator]` line in the event stream; no DM, no `llm.*` log line, no new
   NDJSON field, and the Discord footer simply names the stronger model as
   the one that answered.
