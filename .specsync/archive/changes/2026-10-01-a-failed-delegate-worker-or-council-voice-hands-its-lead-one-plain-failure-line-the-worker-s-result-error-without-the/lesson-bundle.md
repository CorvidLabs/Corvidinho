# Lesson bundle — a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A failed delegate worker or council voice hands its lead one plain failure line (the worker's result error without the provider's host, the no-provider notice, or the exit code), never the worker's summary or stderr, which for a model failure is the provider's raw error body
- **Kind**: BugFix
- **Specs**: agent, watch
- **Paths**: src/autonomous/delegate.ts, src/autonomous/council.ts, src/agent/providers.ts, src/watch/summary.ts, tests/fixtures/fake-llm.ts, tests/autonomous.worker-failure.test.ts, tests/autonomous.delegate.test.ts, specs/agent/agent.spec.md, specs/agent/testing.md, specs/watch/watch.spec.md
- **Acceptance**: Through a lead tool loop and the real task run against the localhost fake provider answering 429 with an org name, a request id and its own host, a failed delegate worker's tool message to the lead model has data.summary 'The model call failed (429 Too Many Requests)' and error 'worker (tier code, depth 1) did not finish (state failed, exit 1):' plus that line, with no org name, request id, provider host, 'LLM HTTP' or provider message; a council whose voice 3 gets that 429 keeps that same line as the voice's transcript entry, the other voices' entries and the chair's decision are their own replies, and no result or later-phase prompt holds the provider detail. workerFailureLine gives the timeout / interrupt line, else the worker's result error as one scrubbed plain line without the provider's host (withoutProviderHost, the helper watchPublicFailureLine now is), else the no-provider notice for the worker's tier, else 'the worker failed (exit N)', never the worker's summary, stdout or stderr. A successful worker, a worker that stopped on an ask of its own, the models and stopReason fields and the SAFE-12/13 fence of a worker that reported an injection are unchanged. The new tests fail on main's src/autonomous/delegate.ts and pass on the branch; WATCH's public line is unchanged.

## Evidence

- Verification commit: `fdee0d8c0fa80d98e1fd71e8b2983cf0eb0715f3`
- Base commit: `cf7f61b2d624fd9b26f4b21f74fd691185f4284d`
- Verified by: `specsync check --spec agent --spec plugins --spec watch`

## From the change's context.md

# Context

Found in the adversarial review of PR #343 (WATCH's failed-run comment, now
merged as b8b5e56): its research note left a model-mediated path open. A
failed `delegate` worker's summary is `LLM HTTP <status>: <provider body>`
(only secrets scrubbed), and `plugins/autonomous/commands.ts` handed it to
the lead model as the tool result — both `data.summary` and the `error`
text (`src/autonomous/delegate.ts` `runDelegateChild`). A failed council
voice's summary went into the council transcript the same way
(`src/autonomous/council.ts` quotes `out.summary` for a failed run). A lead
that still finished could quote it in its answer, so the provider's body
(org or account names, request ids, quota details, sometimes the provider's
host) could reach a public reply or a GitHub comment.

Prior art on main: #340 (DISCORD-3.b) gave the `task run` result an optional
`error` (`modelCallFailedLine`: status and host, never the body) and
`src/discord/failure-reason.ts` (`plainFailureLine`,
`failureReasonFromUnknown`); #343 added `watchPublicFailureLine`
(`src/watch/summary.ts`), which drops the host from a model-call line.

Constraints from the task: reuse or factor the host-free helper (no fork);
keep the worker's `models` (GITHUB-9, #341) and `stopReason` (AGENT-12,
#342) and the SAFE-12 fence of worker output; successful workers unchanged;
no new product surface, no hi capture.

## From the change's design.md

# Design

- **Shared host-free helper** (`src/agent/providers.ts`):
  `withoutProviderHost(reason)` — #343's `MODEL_CALL_HOST_RE` and body,
  moved next to `modelCallFailedLine` whose shapes it matches.
  `watchPublicFailureLine` (`src/watch/summary.ts`) now returns it, so
  WATCH's behaviour is unchanged and there is one copy. Not imported from
  `src/watch/summary.ts` directly: the delegate core is loaded by
  `cli.ts`, `verify.ts`, `must-ask.ts` and others, and the WATCH module
  pulls in Octokit.
- **`workerFailureLine(facts, env, tier)`** (`src/autonomous/delegate.ts`):
  timeout line / interrupt line (the existing harness text); else the
  result `error` through `failureReasonFromUnknown` + `plainFailureLine`
  (scrub, one line, ≤ 200 chars) + `withoutProviderHost`; else
  `providerNotice(env, [tier])` (the worker's own env, so its tier) as one
  line; else `the worker failed (exit N)`. Never stderr: unlike
  `failureReasonFor` there is no stderr fallback, because a worker's stderr
  can carry the provider body.
- **`runDelegateChild`**: `failed` = timed out, aborted, or not (`done` with
  exit 0) and no valid result `ask` (the REQ-watch-086 precedent: a run that
  stopped on an ask of its own keeps its `Needs your input: …` summary). A
  failed worker's `summary` is `workerFailureLine`; `resultText` is set
  only when it did not fail. `state`, `exitCode`, `filesChanged`,
  `verified`, `injection`, `modelFallback`, `models`, `stopReason` are
  read exactly as before.
- **Consumers unchanged in code**: the `delegate` plugin already builds
  `data.summary` and `error` from `outcome.summary`; the council core
  already quotes `out.summary` for a failed run (comments updated). The
  tool loop's SAFE-12/13 fence (`untrustedToolContent`) and AGENT-16 steer
  read the same `data.injection` / `error` as before.
- **Operator logs**: nothing new. The lead keeps no copy of the worker's raw
  summary or stderr and logs none: the lead's own stderr end is a bridge's
  fallback reason for a failed lead (`failureReasonFor`), and WATCH only
  strips a host from a whole model-call line, so a logged body or host there
  could reach a public comment. The worker's line (no host) is what the
  lead's `ToolResult` event carries.
- **Test fixture**: `tests/fixtures/fake-llm.ts` `reply` may return
  `FakeHttpError` (`httpStatus`, raw `body`, `headers`).

## From the change's testing.md

# Testing

`tests/autonomous.worker-failure.test.ts` (10 tests): fake `corvidinho` sh
bins, an in-process lead tool loop (`createTaskExecute` with the fake LLM's
injected fetch) and the real `task run` as the worker, against the localhost
fake provider (`tests/fixtures/fake-llm.ts`) answering 429 with an org name
(`org-acme-widgets-7731`), a request id (`req_7f3c9a1b2d4e5f60`) and its own
host in the body; temp dirs only, no network, no real key.
`tests/autonomous.delegate.test.ts`: the SAFE-6 failure case now asserts the
plain line.

Fail-on-main proof: with main's (cf7f61b) `src/autonomous/delegate.ts`
swapped in (stub exports `workerFailureLine` / `WORKER_*` appended so the
file loads), the two files give 28 pass / 9 fail — every new failure case:
the lead's tool message and the council transcript carry `LLM HTTP 429:
{"error":{"message":"Rate limit reached … organization org-acme-widgets-7731
… https://127.0.0.1:<port>/account/limits."…},"request_id":"req_7f3c…"}`.
Restored: all pass. The helper case and the success / ask case pass on main
too (unchanged behaviour).

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-117` | `tests/autonomous.worker-failure.test.ts` ("delegate: the lead's tool message has the plain line, never the org, request id or host; success unchanged") | The lead model's tool message: `data.summary` `The model call failed (429 Too Many Requests)`, `error` `worker (tier code, depth 1) did not finish (state failed, exit 1):` + that line; no org name, request id, `127.0.0.1:<port>`, `LLM HTTP` or provider message. With a 200 reply the worker's `fake model reply (attempt 1)` comes back as before. Fails on main. |
| `REQ-agent-117` | `tests/autonomous.worker-failure.test.ts` ("a model failure: the plain line without the host …", "an idle-timed-out worker …", "no result frame …", "a successful worker and one that stopped on an ask …") | A 429 from `acme-prod.openai.azure.com:8443` gives the host-free line and keeps `models`; `stopReason: "idle-timeout"` kept with its line; no frame → the no-provider notice, else `the worker failed (exit 1)`, never stdout/stderr; success and ask unchanged. The first three fail on main. |
| `REQ-agent-117` | `tests/autonomous.worker-failure.test.ts` ("workerFailureLine …", "one host-free helper …") | Every source of the line in order; scrub, one line, ≤ 200 chars; `watchPublicFailureLine` is `withoutProviderHost` for every `modelCallFailedLine` shape. |
| `REQ-agent-117` | `tests/autonomous.worker-failure.test.ts` ("SAFE-12/13: a failed worker that reported an injection is still fenced …") | The tool message starts with `injectionWorkerNote`, holds the `<<<UNTRUSTED_` fence and the plain line, and no provider detail. Fails on main. |
| `REQ-agent-117` | `tests/autonomous.delegate.test.ts` ("worker failure is reported as its one plain line, scrubbed (SAFE-6), never its summary") | `data.summary` is the scrubbed result error; neither the token nor the worker's summary is in the result. Fails on main. |
| `REQ-agent-118` | `tests/autonomous.worker-failure.test.ts` ("council: a failed voice's transcript entry is the plain line …") | Voice 3's propose entry: `ok: false`, `failed`, exit 1, `The model call failed (429 Too Many Requests)`; voices 1–2 and the chair keep their own replies; no provider detail in the result or any later phase's prompt. Fails on main. |
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` (unchanged, 8 tests) and `tests/autonomous.worker-failure.test.ts` ("one host-free helper …") | WATCH's public line is unchanged through the shared helper. |

## Automated coverage

- `tests/autonomous.worker-failure.test.ts` (10 tests),
  `tests/autonomous.delegate.test.ts`; the rest of the suite (`bun test`)
  passes unchanged.

## Where these lessons go

- `specs/agent/context.md`
- `specs/watch/context.md`
