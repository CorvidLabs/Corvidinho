---
change: after-the-one-nudge-a-stalled-run-moves-to-the-next-stronger-model-in-the-order-i-set-and-says-so-agent-17-agent-17-a
artifact: testing
---

# Testing

The fake LLM only: an injected fetch that answers by `body.model` (with
usage) for in-process `createTaskExecute` runs, and `startFakeLlm` on
localhost for the real CLI in a scratch non-git project, configured as two
keyless `ollama:` models. A scratch data dir for the spend ledger. No
network, no real key or token, and no test runs the repo's own verify lane.
Every run used a private `TMPDIR`.

Fail-on-base proof (base e1a24ed):

- With the base's `src/agent/execute.ts` swapped in (the branch's
  `providers.ts`, `loop-guards.ts` and `task-summary.ts` kept so the test
  file loads), `bun test tests/agent.stall-escalate.test.ts` gave 14 pass,
  10 fail: every tool-loop case (order set, plan + verify retry, no order,
  top, unordered / other tier, failed earlier, one move per run, both spend
  cases) and the CLI case fail — the move cases never send the third
  request, and the stand cases carry the base's "not built yet" line. The
  14 passing are the pure units, the notes and the worker env.
- With all four base sources (`execute.ts`, `loop-guards.ts`,
  `providers.ts`, `task-summary.ts`) swapped in, the new file does not load
  (`Export named 'stallMovedNote' not found`), and in
  `tests/agent.stall-nudge.test.ts` the three changed cases fail (the old
  stand line, the old guard sequence); 76 pass.
- With the base's `tests/preload.ts` and `src/cli.ts`, the preload probe
  case (the child sees `CORVIDINHO_LLM_MODEL_ORDER`) and the help case fail.
- Restored: all of them pass.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-088` | `tests/agent.stall-escalate.test.ts` ("strongerModel: the next one in the order I set") | Key name and parse ([] unset / blank; entries in order); no order ⇒ `no-order`; next entry the tier's chain holds (bare = `openai:`); the order decides over the fallback list; last ⇒ `top`; not in the order ⇒ `unordered`; an entry the list lacks, one with no key, another tier's model skipped, none ⇒ `unavailable`; a failed model not moved back to; `moveToStronger` moves only on a move. |
| `REQ-agent-088` | `tests/agent.stall-escalate.test.ts` ("the notice, the notes and the guard") | Exact closing line for both kinds, added once, alone when the summary is empty; `closingNotesTail` and a 300-char clip keep it after the fallback note and before the role note; exact moved and stand operator lines for every reason; guard nudge → escalate → stand after `moved()`. |
| `REQ-agent-088` | `tests/agent.stall-escalate.test.ts` ("tool loop …") | Order set: models weak, weak, strong, strong; one nudge; the strong model's first request equals the weak model's second; file written; summary ends with the note; both operator lines; usage per model; answering model strong. Plan + verify retry stays on strong. No order: two requests, nudge, stand line. Top / unordered / other tier: no move with the reason. Failed earlier: not moved back to. Strong stalls too: stands (`already moved`). Answer after the nudge: no move. Spend ledger rows gpt-4o-mini ×2 then gpt-4.1 under a $5 cap; an unpriced stronger model under a cap ⇒ `spend-cap` ask, never sent. Fail on base. |
| `REQ-agent-088` | `tests/agent.stall-escalate.test.ts` ("delegate workers …") | `buildDelegateSpawn` keeps `CORVIDINHO_LLM_MODEL_ORDER` with the model list. |
| `REQ-agent-088` | `tests/agent.stall-escalate.test.ts` ("task run CLI …") | Real `task run --output ndjson` at code tier: requests fake-weak, fake-weak, fake-strong; two AGENT-17 operator frames (the second names the move); result `done`, summary ends with the note, `model` is `ollama:fake-strong`. Fail on base. |
| `REQ-agent-087` | `tests/agent.stall-nudge.test.ts` | With no order set the second stall stands with `(no model order is set, so it does not move to another model)`; the guard gives nudge, escalate (until moved), stand; every other nudge case unchanged. Fail on base (old line, old guard). |
| `REQ-cli-009` | `tests/agent.cli.test.ts` | `--help` lists `CORVIDINHO_LLM_MODEL_ORDER`. Fail on base. |
| `REQ-cli-262` | `tests/preload.operator-data-dir.test.ts`, `tests/fixtures/preload-probe.ts` | The child `bun test` started with `CORVIDINHO_LLM_MODEL_ORDER` set does not see it (probe run-settings list). Fail on base. |
