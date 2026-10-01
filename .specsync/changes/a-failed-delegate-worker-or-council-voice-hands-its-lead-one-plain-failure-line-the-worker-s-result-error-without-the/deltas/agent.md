---
module: agent
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
---

# Delta: agent (a failed delegate worker or council voice hands its lead one plain failure line)

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
SAFE-6 scrubbed and capped. A worker that failed — not `done` with exit 0,
and not stopped on an ask of its own (a valid result `ask`) — SHALL come back
to its lead as one plain line of harness text, `workerFailureLine` (both the
tool's `data.summary` and the end of its `error`): the timeout line (`worker
timed out and was stopped`) or the interrupt line (`worker stopped: lead run
was interrupted`); else the worker's result `error` (which model call failed
and how, which verify failed, the idle-timeout line) as one plain line
(`plainFailureLine`: SAFE-6 scrubbed, stack frames and host paths dropped, at
most 200 characters) without the provider's host (`withoutProviderHost`,
`src/agent/providers.ts`, the helper WATCH's public comment uses,
REQ-watch-009: `The model call failed (429 Too Many Requests)`); else the
no-provider notice for the worker's tier in its env (AGENT-10); else `the
worker failed (exit N)`. It SHALL NOT hand over the worker's summary, its
result's summary (`resultText` is set only for a worker that did not fail)
or its stdout / stderr, which for a model failure is `LLM HTTP <status>:
<provider body>` — org or account names, request ids, the provider's host —
that a lead could quote into a public reply or GitHub comment. The lead
SHALL keep no other copy of that detail (nothing is written to its stderr,
whose end a bridge reads as a failed lead's fallback reason). A successful
worker's summary, an ask's question and the worker's `models`,
`stopReason`, `modelFallback` and `injection` fields (and so the SAFE-12/13
fence of a worker that reported a hit) are unchanged. The models the worker's result frame names (its
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
- A worker whose result `error` is a 429 from `acme-prod.openai.azure.com:8443` and whose summary and stderr are `LLM HTTP 429: <body>` (an org name, a request id, the host) comes back with `data.summary` `The model call failed (429 Too Many Requests)` and `error` `worker (tier code, depth 1) did not finish (state failed, exit 1):` plus that line, its `models` kept, and no provider detail anywhere in the tool result; an idle-timed-out worker keeps `stopReason: "idle-timeout"` and its line; a worker with no result frame hands over the no-provider notice, else `the worker failed (exit N)`, never its stdout or stderr; a successful worker and one that stopped on an ask of its own are unchanged; a failed worker that reported an injection is still fenced for the lead with the line inside.
- Through a lead tool loop and the real `task run` against the localhost fake provider answering 429 with an org name, a request id and its own host, the lead model's tool message has the plain line and none of them; with a 200 reply the worker's answer comes back as before (`tests/autonomous.worker-failure.test.ts`, which fails on main's `src/autonomous/delegate.ts`).

### REQUIREMENT REQ-agent-118

A council SHALL deliberate in structured phases when a decision needs more
than one voice (AUTONOMOUS-6). `runCouncil` (`src/autonomous/council.ts`)
SHALL run, in order: **propose**, where each of N voices (2..5) answers the
question independently; **critique**, where each voice whose proposal
finished sees every finished proposal (its own marked as its own) and
critiques the others; and **decide**, where one chair run synthesizes a
decision from the finished proposals and critiques. When fewer than 2 voices
finish the propose phase, no critique or decide run SHALL start and the
outcome SHALL be failed. Failed critiques SHALL NOT block the decide phase.
When the chair does not finish, the outcome SHALL be failed with an empty
decision.

Every voice and the chair SHALL run through the delegation core
(`runDelegateChild`, REQ-agent-117) one level deeper than the lead, so each
keeps its argv, worker env stripping, timeout / abort / exit cleanup and
scrubbed summary. A voice or chair run that failed SHALL be quoted in the
transcript by the delegate core's one plain failure line
(`workerFailureLine`, REQ-agent-117) — never its summary or stderr, so no
provider's raw error body or host reaches the transcript the lead reads. Voices SHALL run at the `read` tier by default, never above
`tool` and never above the lead's tier (an unknown tier is refused). They
SHALL run as non-ADMIN role sessions (`CORVIDINHO_ACTING_IS_ADMIN=0`), so
mutating tools are absent and refused (ROLES-CHAT-2/3), and SHALL get an
empty SAFE-1 allowlist, so a must-ask tool is always denied. At most 2 voices
(`MAX_CONCURRENT_DELEGATES`) SHALL run at once. Each phase entry SHALL be
SAFE-6 scrubbed and capped (1500 chars per voice entry, `DELEGATE_SUMMARY_MAX`
for the decision). Later phases SHALL see only capped text, quoted as data
and not as instructions. A finished run SHALL be quoted by the worker's own
result summary (`DelegateChildOutcome.resultText`, capped at
`DELEGATE_SUMMARY_MAX` rather than the 1800-char chat body).
Each run SHALL get a per-voice time cap (5 min) no larger than the time left.
The whole council SHALL have a wall-clock cap (15 min). When the cap is
reached or the lead aborts, running voices SHALL be stopped, no later phase
SHALL start, and the outcome SHALL be cancelled. The outcome SHALL carry the
decision, the transcript (phase, speaker, lens, ok, state, exit code, text),
per-phase tallies, the union of voice filesChanged, summed tokens, elapsed
time and timeout / abort flags. The voice tier, caps and lenses are safety
defaults. Draft AUTONOMOUS-11 (a multi-model council with a confidence
score) is not an acceptance criterion: voices use the lead's provider and the
council returns no confidence score.

Acceptance Criteria
- With 3 voices the runs go propose 1..3, critique 1..3, then decide, never more than 2 at once. Critique prompts contain every finished proposal, the decide prompt contains every finished proposal and critique, and the outcome is done with the chair's text as the decision.
- A failed proposal drops that voice from critique. Fewer than 2 finished proposals ends the council failed with no critique or decide. Failed critiques still reach the chair. A failed chair gives ok=false and an empty decision. A runner that throws is a failed entry.
- Entries and the decision are scrubbed and capped. The per-voice timeout never exceeds the voice cap or the time left. The council time cap and a lead abort stop running voices, skip later phases and give state cancelled.
- The voice tier defaults to read, `code` is clamped to tool, a read lead clamps to read, and an unknown tier is refused.
- The tool loop offers `council` only for an autonomous-enabled project at code tier below the depth cap, and a lead that calls it gets the decision in the tool message.
- A 3-voice council whose voice 3's model answers 429 with an org name, a request id and its own host (the real `task run`, the localhost fake provider): that voice's propose entry is `ok: false`, `state: failed`, exit 1, text `The model call failed (429 Too Many Requests)`; the other voices' entries and the chair's decision are their own replies; neither the tool result nor any later phase's prompt holds the provider detail.
