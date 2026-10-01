---
module: agent
change: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
---

# Delta: agent (the tool loop hands github-pr-create its run for the second-model review — GITHUB-9, GITHUB-9.a)

## Added

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

Acceptance Criteria
- Through `createTaskExecute` and a scripted provider in a temp repo: the reviewer is the first other configured model (`CORVIDINHO_LLM_MODEL_READ` here), called once with no `tools` and a system plus a fenced user message holding the diff; the findings come back fenced as round 1 of 3; the same call again opens the PR listing them as not changed; no tool message carries the AGENT-16 steer; the run's `usageByModel` has the reviewer's row (an unpriced reviewer makes `answerSpendFor`'s cost unknown) and `onModel` names only the run's model.
- With no second model three identical `github-pr-create` calls all run and refuse, none gets the AGENT-16 steer or the stuck ask, no reviewer is called, and the summary ends with `PR not opened: there is no second model …` (GITHUB-9.a).
- A reviewer on its own provider whose cap covers it (no owner configured) ends the run with the `spend-cap` ask, no review request is sent, nothing is recorded and the summary has no `PR not opened` line.
- A `delegate` result whose `data.models` names the worker's model makes that model an author: the reviewer is the next configured model.
- Two `github-pr-create` calls in one batch: the first gets round 1's findings, the second is not run, one review call is made and the cycle stays open (not declined).

## Modified

### REQUIREMENT REQ-agent-117

Autonomous mode SHALL be off until the project enables it in project config
(AUTONOMOUS-1). `src/autonomous/enabled.ts` SHALL read `<cwd>/fledge.toml` and
treat autonomous mode as enabled only when the key
`corvidinho.autonomous.enabled` (table `[corvidinho.autonomous]` or the dotted
key under `[corvidinho]`) is the literal `true`. A missing file, section or
key, any other value, an inline table, or a key under a later `[table]` /
`[[array]]` header SHALL be off.

The task-run tool loop SHALL offer autonomous extras (plugins declaring
`autonomous: true`, such as `delegate`) only when the session is allowed:
autonomous mode is enabled for the run's cwd and the delegation depth
(`CORVIDINHO_DELEGATE_DEPTH`; unset is 0, a malformed value is treated as the
cap) is below 2. Otherwise they SHALL be absent from the catalog at every tier
(SAFE-9), and a model naming them SHALL get the REQ-agent-128 refusal. The
loop SHALL pass its capability tier and abort signal to `runPlugin`.

The delegation core (`src/autonomous/delegate.ts`) SHALL run a worker as
`task run --here --non-interactive --tier <t> --output ndjson --task <text>`
through `buildCorvidinhoArgv` (`--here`: the worker works in its lead's cwd
and never makes a worktree of its own, REQ-cli-122) (so a `.ts` bin runs as `bun --no-env-file`), with
the `--task` value last and never `--no-verify` (REQ-cli-085): a worker keeps
the project's prove-before-done gate (AGENT-4) and reports its `verified` /
`verifySkipped` outcome. The worker bin SHALL be `CORVIDINHO_BIN` when set,
else this checkout's `src/cli.ts`, never the cwd's. The worker tier SHALL be
the requested tier clamped to the lead's; an omitted tier SHALL mean the
lead's tier and an unknown tier SHALL be refused. The worker env SHALL be
the lead's env without `DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`,
`CORVIDINHO_AUDIT_HMAC_KEY` and every `CORVIDINHO_ACTING_*` key (SAFE-6; LLM
provider keys stay), and SHALL force the depth to the lead's depth + 1,
`CORVIDINHO_LLM_TIER` to the worker tier, `CORVIDINHO_NON_INTERACTIVE=1` and
`CORVIDINHO_ALLOWLIST` to the lead's effective allowlist, overriding inherited
values, so a worker never inherits ADMIN or human SAFE-4 confirm tokens. It
SHALL set `CORVIDINHO_DELEGATE_AUTHORS` to the lead's change authors (GITHUB-9:
validated entry labels, comma-joined, at most 32) when the lead gives any,
and drop an inherited value otherwise; a worker (depth above 0) SHALL count
them as authors of its own change (`delegateAuthorsFromEnv`), so a PR it
opens is never reviewed by a model that wrote part of it. When
the lead runs in a ROLES-CHAT role session (`CORVIDINHO_ACTING_IS_ADMIN` set)
the worker env SHALL set `CORVIDINHO_ACTING_IS_ADMIN=0`, making the worker a
non-ADMIN session with read/chat tools only (ROLES-CHAT-2/3); a lead outside a
role session (local CLI) SHALL get a worker outside one. At most 2
workers SHALL run at once and at most 4 SHALL start per lead process; beyond
that the call is refused, not queued. A worker SHALL be stopped on lead abort
(AGENT-3), after a 10 minute timeout, or when the lead process exits or dies
of a SIGINT / SIGTERM / SIGHUP it did not start with ignored
(REQ-plugins-154); it SHALL run in its own process group and
stopping it SHALL stop its whole process tree (SIGTERM, then SIGKILL after a
2 s grace or as soon as the worker exits, REQ-plugins-154), so its plugins
and depth-2 workers never outlive the limit. What the worker left in its
group as it exited SHALL still be stopped by an abort or timeout during the
pipe drain, or by the lead exiting. The
lead SHALL NOT wait on a worker pipe held open by a grandchild beyond a short
drain after the worker exits. The worker summary returned to the lead SHALL be
SAFE-6 scrubbed and capped. The models the worker's result frame names (its
answering `model`, each `usageByModel` row and both ends of each
`modelFallback` hop; validated, scrubbed, bounded) SHALL come back as
`DelegateChildOutcome.models` (`workerModelsFromResult`), which the lead
counts as authors of its change (REQ-agent-092). The depth, tier and fan-out limits are safety
defaults; draft AUTONOMOUS-10 is not an acceptance criterion and stays left
for HI capture.

Acceptance Criteria
- Only `[corvidinho.autonomous] enabled = true` (or the dotted key) turns autonomous mode on; string / number / inline-table / later-table values and a missing file are off; this repo's `fledge.toml` ships off.
- `buildOpenAiTools` omits `delegate` unless `autonomous: true`, and offers it at code tier only.
- `createTaskExecute` in a temp project with autonomous enabled at code tier offers `delegate`; a disabled project, tool tier, or depth 2 does not; a model call to a hidden `delegate` is refused, not run.
- A lead tool loop that calls `delegate` against a fake bin receives the worker summary in the tool message, and the worker's filesChanged join the lead's result.
- Depth parse fails closed; tier clamp never exceeds the lead; spawn argv uses `bun --no-env-file` with `--task` last and no `--no-verify` flag; forced worker env overrides inherited env; the limiter refuses past 2 concurrent / 4 per run.
- The worker env (and the spawned worker process) has no `DISCORD_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `CORVIDINHO_AUDIT_HMAC_KEY` or inherited `CORVIDINHO_ACTING_*` key and keeps LLM provider keys; a role-session lead gets `CORVIDINHO_ACTING_IS_ADMIN=0`, a CLI lead none.
- A non-ADMIN role session's catalog leaves out `delegate` even when autonomous mode is allowed; the ADMIN owner's catalog offers it (ROLES-CHAT-2/4).
- Worker timeout, lead abort, and a grandchild holding the pipe do not hang the lead; a `.env` in the cwd is not loaded by a `.ts` worker.
- Worker timeout and lead abort kill the worker's same-group and `setsid` grandchildren, not just the worker.
- A lead abort after the worker exited, while its background grandchild still holds the pipe, kills that grandchild.
- Spawn argv has `--here` right after `task run` (REQ-cli-122): a worker never makes a worktree of its own.
- GITHUB-9: `buildDelegateSpawn` sets `CORVIDINHO_DELEGATE_AUTHORS` from `authors` and drops an inherited value when none is given; `delegateAuthorsFromEnv` trims, dedupes and bounds; `workerModelsFromResult` lists the answering model, usage models and failover ends, scrubbed, and nothing for an empty frame.
