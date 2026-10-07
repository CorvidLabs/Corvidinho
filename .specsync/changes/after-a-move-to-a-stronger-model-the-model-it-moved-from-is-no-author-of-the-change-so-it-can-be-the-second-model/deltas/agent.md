---
module: agent
change: after-a-move-to-a-stronger-model-the-model-it-moved-from-is-no-author-of-the-change-so-it-can-be-the-second-model
---

# Delta: agent (the model a run moved from is no author of the change — AGENT-17.a, GITHUB-9.a)

The requirements are unchanged in intent: after the nudge a stalled run
moves to the next stronger model in the order I set (REQ-agent-088), and the
models that wrote a change are recorded for its checkout (REQ-agent-092).
REQ-agent-088 gets one paragraph and two acceptance criteria so the model
the run moved from, which wrote none of the change, is not counted among the
change's authors, and can be the second-model reviewer (GITHUB-9.a).
REQ-agent-092 records the run's authors only after a call AGENT-17 counts as
a change, so a `delegate` call refused before any worker ran no longer
records the model that is about to be moved from. No config key, flag, slash
command, HumanAsk reason, NDJSON field, table or schema version changes.

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
run moved from wrote none of the change, and the run has recorded no author
for the checkout yet (REQ-agent-092 records only after a call AGENT-17
counts as a change; a `delegate` call refused before any worker ran records
nothing): on a move `createTaskExecute` SHALL drop it from the run's
`authors()` (REQ-agent-092, GITHUB-9.a: the reviewer is the first configured
model that didn't write the change), so a later state change records only
the models that wrote it (`recordChangeAuthors`) and, with two configured
models, the model it moved from can review the stronger model's change. It
SHALL stay an author when the lead's authors (`CORVIDINHO_DELEGATE_AUTHORS`),
a `delegate` result's `data.models` or a failover (the run's own or a
worker's) also name it, and a later reply from it in the run makes it an
author again (`onModel`). A worker's own move does not reach its lead: the
worker's `data.models` still name the model it moved from whenever its
usage was reported (`usageByModel`), so the lead counts that model as an
author.

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
- In a git checkout, a `delegate` call the weak model made that was refused before any worker ran records no author: after the move and the stronger model's change, the checkout's `pr_change_authors` record is the stronger model only and the weak model is the reviewer.

### REQUIREMENT REQ-agent-092

Before the PR, a second model reviews the diff in bounded rounds, and the PR
lists what it raised and what changed (GITHUB-9); the reviewer is the first
other model I've configured that didn't write the change, there's no
reviewer setting, and with no second model there's no PR and the reply says
why (GITHUB-9.a). The task-run tool loop (`createTaskExecute`) is the run
model for every agent path that can call `github-pr-create` — Discord chat,
slash and button runs, `/session`, owner schedules, the local `task run`
and delegate workers — and SHALL hand each `runPlugin` call a `PrReviewRun`
(REQ-plugins-092):

- `env`: the run's env (its AGENT-13 model config);
- `authors()`: every model that wrote this run's change — each configured
  model its own chain answered from (`onModel`) and each one it failed over
  from (AGENT-11), its delegate and council workers' failover ends, the
  models a `delegate` result reports in `data.models` (validated, at most
  32), and, in a worker (delegation depth above 0), its lead's
  (`CORVIDINHO_DELEGATE_AUTHORS`, REQ-agent-117);
- `complete(provider, messages, signal?)`: one chat completions call to that
  provider with no tools, through the same `chatCompletions` path, per-request
  timeout and SAFE-8 spend-guarded fetch as the run's own calls; its usage
  SHALL be reported through the run's `onUsage` under the reviewer's entry
  label (so the run's `usageByModel` and the owner's answer footer price it
  at its own price or show the cost as unknown, DISCORD-15.a / SAFE-16)
  while the answering model (`onModel`, `TaskResult.model`) stays the run's
  own.

After each offered tool call that changed, or may have changed, the
checkout (a `changedState` result, a finished `delegate` worker or one that
reported a changed file included, or a call whose edits no result reports: a
tool that edits files unreported, or a `delegate` worker that ran and may
have, REQ-agent-502; the calls AGENT-17 counts as a change, so a `delegate`
call refused before any worker ran records nothing), the loop SHALL record
the run's current `authors()` for it
(`recordChangeAuthors`: the git top level of the run's cwd and the branch
checked out then, `""` when detached; the `pr_change_authors` table, created
on first use with no schema version bump, each (checkout, branch, model)
once, labels scrubbed on write and listed in `SCRUB_TARGETS`; best effort,
never failing the call), so a later run that opens the PR from that
checkout — the next message, a resumed run — counts them as authors
(GITHUB-9.a, REQ-plugins-092).

When `github-pr-create` throws `ReviewSpendStop` (its review call stopped at
a spend cap) the attempt SHALL end at once with a `ToolResult` failure, and
the spend guard's `finish` SHALL turn it into the run's spend-cap ask
(blocked; the Approve card / ask path of SAFE-8, AUTONOMY-8), never a
review "unavailable" line. A tool result with `reviewHold` (findings for a
round, or a review refusal) SHALL NOT be counted by the AGENT-16
repeat-failure guard (no steer, no stuck ask for calling it again) and is no
change for AGENT-17. Once a `github-pr-create` in one batch of tool calls got
the reviewer's findings, a later `github-pr-create` in the same batch SHALL
NOT run (a `findings` hold saying to read them first), so an unchanged tree
never counts as declining findings the model has not read. When the run's latest `github-pr-create` result is a
review refusal (`reviewHold: "refused"`), every summary after it SHALL end
with that one line (`withReviewRefusalNote`, added once, scrubbed, before
the role note); a later call that opened a PR or got findings clears it.

An owner or team `/work` run (REQ-cli-092) SHALL also drive the review
rounds itself before the `/work` PR step (REQ-discord-088), through
`RunTaskOptions.review` (a `ReviewHook`: `maxRounds` and `run({signal})`).
`createTaskExecute` SHALL return its execute fn with `review` (the run's
`PrReviewRun` above) and `takeSpendAsk()` (the spend-cap ask a stopped
review call left, then cleared; null when there is none). After a passing
verify lane — and, when the run opened SpecSync changes, after they are
settled and verified again (REQ-agent-519) — `runTask` SHALL call the hook
before the run is done:

- `finished` (a round raised nothing, the tree was left unchanged after
  findings, or the last round): done and verified, with
  `TaskResult.review` `{state: "finished"}`;
- `findings`: the hook's feedback SHALL be the next attempt's
  `verifyFeedback`, and that attempt SHALL pass the verify gate again before
  the next review step;
- `refused` (GITHUB-9.a: no second model; or any other reason no review can
  finish): done and verified, with `TaskResult.review` `{state: "refused",
  reason}` (one plain line of harness text), so no PR follows;
- `ask` (a SAFE-8 spend-cap stop of the review call): the run SHALL end
  `blocked` on that ask (AUTONOMY-8).

The review rounds SHALL have their own counter, apart from the AGENT-4.a
verify retries: at most `maxRounds - 1` steps hand findings back, and one
more, or a hook that throws, SHALL fail closed as `refused`. A run that
changed nothing or whose verify failed never calls the hook. Each step is
one `Text` event. `TaskResult.review` is additive (no protocol change) and
absent on every run without the hook.

Acceptance Criteria
- With a scripted hook: findings then finished end the run done and verified after 2 attempts with the verify lane run twice, attempt 2's feedback is the findings text, `review` is `{state: "finished"}`, and this holds with `maxRetries: 0`.
- A refusal ends the run done and verified with `review: {state: "refused", reason}` and a `Second-model review: no PR — <reason>` Text event; a hook that keeps raising findings is called 3 times and ends refused (`did not end within 3 rounds`); a throwing hook ends refused (`could not run`); a spend-cap ask ends the run `blocked` with that ask and no `review`; a run that changed nothing, or whose verify failed, never calls the hook.
- Through `createTaskExecute` (code tier, `files-write`), `runTask` and `workReviewHook` in a temp repo with a scripted provider: round 1's findings reach attempt 2 fenced as untrusted data, the model's change gets round 2, which raises nothing, and `review` is `{state: "finished"}`; with one configured model the run is done with `review` refused for the GITHUB-9.a reason and no reviewer call.
- Through `createTaskExecute` and a scripted provider in a temp repo: the reviewer is the first other configured model (`CORVIDINHO_LLM_MODEL_READ` here), called once with no `tools` and a system plus a fenced user message holding the diff; the findings come back fenced as round 1 of 3; the same call again opens the PR listing them as not changed; no tool message carries the AGENT-16 steer; the run's `usageByModel` has the reviewer's row (an unpriced reviewer makes `answerSpendFor`'s cost unknown) and `onModel` names only the run's model.
- With no second model three identical `github-pr-create` calls all run and refuse, none gets the AGENT-16 steer or the stuck ask, no reviewer is called, and the summary ends with `PR not opened: there is no second model …` (GITHUB-9.a).
- A reviewer on its own provider whose cap covers it (no owner configured) ends the run with the `spend-cap` ask, no review request is sent, nothing is recorded and the summary has no `PR not opened` line.
- A `delegate` result whose `data.models` names the worker's model makes that model an author: the reviewer is the next configured model.
- Run 1, whose head model fails over to the next one, which writes a file; run 2 (a new `createTaskExecute`), whose head model answers and opens the PR from the same checkout: the reviewer is the third configured model, never the one that wrote the change. `recordChangeAuthors` keeps each model once per checkout and branch, scrubbed, and records nothing below a git top level.
- Two `github-pr-create` calls in one batch: the first gets round 1's findings, the second is not run, one review call is made and the cycle stays open (not declined).
