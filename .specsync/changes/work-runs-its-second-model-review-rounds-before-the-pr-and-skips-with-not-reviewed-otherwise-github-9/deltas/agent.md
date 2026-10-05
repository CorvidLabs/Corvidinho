---
module: agent
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
---

# Delta: agent (/work runs its second-model review rounds before done — GITHUB-9)

## Modified

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
checkout (a `changedState` result, a tool whose edits no result reports, or
`delegate`), the loop SHALL record the run's current `authors()` for it
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
