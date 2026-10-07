---
module: agent
change: after-a-move-to-a-stronger-model-the-model-it-moved-from-is-no-author-of-the-change-so-it-can-be-the-second-model
---

# Delta: agent (the model a run moved from is no author of the change — AGENT-17.a, GITHUB-9.a)

The requirement is unchanged in intent: after the nudge a stalled run moves
to the next stronger model in the order I set. One paragraph and one
acceptance criterion are added so the model the run moved from, which wrote
none of the change, is not counted among the change's authors, and can be
the second-model reviewer (GITHUB-9.a). No config key, flag, slash command,
HumanAsk reason, NDJSON field, table or schema version changes.

## Modified

### REQUIREMENT REQ-agent-088


After the one nudge it moves to the next stronger model in the order I set
(AGENT-17, on main: "If it only plans, or says 'Done.' without changing
anything, it gets one nudge, then moves to a stronger model I've
configured."; AGENT-17.a, captured from Leif's 2026-09-28 interview, round
16: "A stronger model is the next one in an order I set in the model list;
with no order set it doesn't move, and the one nudge still happens.").

The order SHALL be the optional `CORVIDINHO_LLM_MODEL_ORDER`
(`MODEL_ORDER_ENV`, `src/agent/providers.ts`): a comma list of the same
`kind:model` entries as the model list (`parseModelChain`), weakest first.
Unset or empty is no order. The model list's own (fallback) order is not a
strength order, and nothing SHALL be ranked by price or benchmark.

When the REQ-agent-087 stall guard gives a stall after the run's nudge
(`next()` → `"escalate"`), `runToolLoop` SHALL call the run's
`ModelCalls.escalate(kind)`, which `createTaskExecute` backs with
`moveToStronger(chain, order)` on the run's own model chain. `strongerModel`
SHALL pick the first entry after the chain's current model in the order
(entries compared by `entryLabel`, so `openai:x` and `x` are one entry) that
is one of the chain's own entries (the run's tier's model list, AGENT-5),
whose kind has its key, and that has not failed in this run (not a
`from` of the chain's failovers), trying later entries in the order in turn.
It SHALL NOT move with no order (`no-order`), when the current model is not in
the order (`unordered`), when it is the last in it (`top`), or when no entry
after it is available (`unavailable`); it SHALL never move to a weaker or an
unordered model.

On a move the chain keeps the stronger model for every later call of the run
(later rounds and verify retries; a failure of it falls back the AGENT-11
way). The stalled reply SHALL be dropped from the conversation and the same
request sent to the stronger model (no second nudge, no tool round used),
the text that stood before it standing again; the guard records `moved()`, so
a run moves at most once. One Text event `[operator] AGENT-17: the reply was
<only a plan | a 'Done.'-style or empty claim> with nothing changed, after the
nudge; moving from <a> to the stronger model <b> (next in the model order)`
(`stallMovedNote`) SHALL be emitted, and every later summary of the run SHALL
end, after any AGENT-11 fallback note and before every other closing note,
with one plain line `(stronger model: <a> only planned | said it was done
with nothing changed after the nudge, so <b> took over)`
(`withStrongerModelNote`), which `closingNotesTail` keeps through clips and
Discord's split. Without a move the stall stands with
`stallStandsNote(kind, why)` (`moved` once the run already moved). The
stronger model's calls SHALL go through the same chat transport and SAFE-8 /
SAFE-14 spend guard as every call, counted and priced under its own model
(`onUsage` per model), so a cap stop or an unpriced-model ask applies to it
(AUTONOMY-8) and is never routed around. Delegate workers inherit the order
(it is not a dropped worker key) and apply the same rule in their own run.
No config key, flag, slash command, HumanAsk reason, NDJSON field, table or
schema version is added.

A move only follows a stall in a run where nothing changed, so the model the
run moved from wrote none of the change: on a move `createTaskExecute` SHALL
drop it from the run's `authors()` (REQ-agent-092, GITHUB-9.a: the reviewer
is the first configured model that didn't write the change), so a later
state change records only the models that wrote it (`recordChangeAuthors`)
and, with two configured models, the model it moved from can review the
stronger model's change. It SHALL stay an author when the lead's authors
(`CORVIDINHO_DELEGATE_AUTHORS`), a `delegate` result's `data.models` or a
failover (the run's own or a worker's) also name it, and a later reply from
it in the run makes it an author again (`onModel`).

Acceptance Criteria
- `modelOrderFromEnv` is [] unset or blank and parses `kind:model` entries in order; `MODEL_ORDER_ENV` is `CORVIDINHO_LLM_MODEL_ORDER`.
- `strongerModel`: no order ⇒ `no-order`; the next entry the tier's chain holds ⇒ that entry (bare and `openai:` match); the order, not the fallback list, decides; the last in the order ⇒ `top`; a model not in the order ⇒ `unordered`; an order entry the tier's list lacks, one without its key, or another tier's model is skipped (none left ⇒ `unavailable`); a model that failed in the run is never moved back to; `moveToStronger` changes `chain.index` only on a move.
- `strongerModelNote` reads `(stronger model: <a> only planned after the nudge, so <b> took over)` / `… said it was done with nothing changed after the nudge …`; `withStrongerModelNote` adds it once; `closingNotesTail` and a clip keep it after the fallback note and before the role note.
- With an order set, a code-tier run whose weak model says "Done." twice makes requests weak, weak (with the one nudge), then the second request's exact messages to the stronger model; the stronger model's work stands, the summary ends with the note, both operator lines are emitted, usage is counted per model and the answering model is the stronger one; a plan moves the same way and a later attempt stays on the stronger model.
- With no order set: the nudge, then the reply stands (two requests, both to the first model).
- Already at the top of the order, an unordered current model, or a stronger model only another tier lists: no move, the reply stands with the line naming why.
- A model that failed earlier in the run is not moved back to; the stronger model stalling too stands (`it already moved to a stronger model once in this run`); an answer after the nudge is no stall.
- Under a spend cap the stronger model's call is in the spend ledger under its own model; an unpriced stronger model under a cap stops and asks (`spend-cap`) before it is sent.
- A delegate worker's env keeps `CORVIDINHO_LLM_MODEL_ORDER`.
- The real CLI (`task run --output ndjson`, two localhost `ollama:` models, the order set) makes three requests (weak, weak, strong), emits both operator lines, and ends `done` with the note and `model` naming the stronger model.
- After a move (two configured models, the order set, the weak model saying "Done." twice, the stronger one changing `README.md`), the run's `review.authors()` is the stronger model only and `resolveReviewer` picks the weak model; in a worker whose lead's authors name the weak model it stays an author after the move and there is no reviewer.
