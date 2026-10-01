# Lesson bundle — a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A failed GitHub WATCH run's comment says why in one plain line (which model call failed: status and host), never the provider's raw error body; REQ-cli-079 matches what a daemon no-provider schedule run now records
- **Kind**: BugFix
- **Specs**: watch, cli
- **Paths**: src/watch/types.ts, src/watch/agent-client.ts, src/watch/summary.ts, src/watch/poller.ts, tests/watch.failed-comment.test.ts, tests/watch.summary-scrub.test.ts, tests/watch.reliability.test.ts, docs/WATCH.md, tests/daemon.no-provider-run.test.ts, specs/watch/watch.spec.md, specs/watch/testing.md, specs/cli/cli.spec.md, specs/cli/testing.md
- **Acceptance**: A failed WATCH run without an ask of its own posts, under 'Corvidinho WATCH run summary — Failed (exit N).', one plain reason line (DISCORD-3.b's failureReasonFor: the task run result's error — which model call failed as status and host, never the provider body; else the tier's no-provider notice; else the stderr end; else the exit code; SAFE-6 scrubbed, at most 200 chars) and never the run's summary: through startWatchPoller and the real task run against a localhost model answering 429 with an org name and a request id, the comment is exactly the status line, 'The model call failed (429 Too Many Requests from 127.0.0.1:<port>)' and the footer, with neither the org name nor the request id; the watcher logs '[watch] run failed (<repo>#<n> id=<id>, exit N): <reason>' (no exit for a spawn that threw); the thread's kept agent turn is that line; the operator-only spawn JSONL keeps the scrubbed summary; a successful run, a failed run with an ask (Needs your input, AGENT-16.a) and a spend-cap stop (SAFE-14.a) are unchanged; tests/watch.failed-comment.test.ts fails on main's sources and passes on the branch. REQ-cli-079 says what a daemon no-provider schedule run now records (DISCORD-3.b, #340): the run row's summary is the no-provider notice on the owner's own schedule and 'That didn't work.' on anyone else's, its error and the run.finished error are 'failed (exit 1): <notice>', a '[scheduler] run failed (schedule <id>, exit 1): <notice>' line is logged, and the daemon posts nothing to a channel itself.

## Evidence

- Verification commit: `86e4acac1a2ddd8cf145053363079c1dd509b3e4`
- Base commit: `aeb2de3407acd0990897121ac68caf1553be0118`
- Verified by: `specsync check --spec cli --spec watch`

## From the change's context.md

# Context

Found in the review of #340 (DISCORD-3.b, merged as aeb2de3). #340 made every
Discord surface show a failed run's owner one plain, secret-scrubbed reason
(`src/discord/failure-reason.ts`, `modelCallFailedLine`: status and host,
never the provider's reply body) and added the `task run` result's optional
`error`. Its review found two leftovers:

1. A failed WATCH run's public GitHub summary comment still posted the run
   summary. For a model failure that is `LLM HTTP <status>: <provider body>`
   (`src/agent/execute.ts`): scrubbed of vendor keys, but the provider's raw
   reply — account or org names, request ids, quota details — on a public
   issue or PR. The same text was kept as the thread's agent turn and
   replayed to the model on the next event there, so a later answer could
   repeat it.
2. REQ-cli-079 still said a daemon no-provider schedule run's "channel post
   and run row keep the usual `failed (exit 1)` line". Since #340 the
   scheduler records the DISCORD-3.b line (`src/scheduler/service.ts`), and
   the daemon (`src/daemon/daemon.ts`) wires no owner DM and no outbound
   poster.

Constraints: no new product surface and no new `hi` criteria (the
behaviour follows WATCH-RELIABILITY-1, SAFE-6/12/14.a and #340's reason
source); successful runs, the stuck-ask DM (AGENT-16.a, #313) and the
spend-cap texts (SAFE-14.a) stay as they are; no env var, config key, schema
or protocol change.

## From the change's design.md

# Design

- **Spawn client** (`src/watch/agent-client.ts`): like the Discord client
  since #340, a failed run hands back `failureReason`
  (`failureReasonFromUnknown(result.error)`) and `stderrTail`; both are new
  optional fields on the WATCH `AgentSpawnResult` (`src/watch/types.ts`).
- **Reason** (`src/watch/summary.ts`): `watchFailureReason(spawn, env)`
  returns null for a run that did not fail or stopped on an ask of its own,
  else `failureReasonFor({ exitCode, failureReason, stderrTail }, env)` from
  `src/discord/failure-reason.ts` — one reason source for Discord and
  GitHub (the scheduler already imports it the same way). `buildSummaryBody`
  uses it in place of the clipped summary; the status line, the SAFE-13
  owner line and the footer are unchanged. `env` is the watcher's env (the
  same one its AGENT-10 start-up notice reads); default `process.env`.
- **Poller** (`src/watch/poller.ts`): keeps the spawn's `failureReason` /
  `stderrTail` (a thrown spawn's message becomes `failureReason`), computes
  the reason once, logs `formatFailureLog("[watch]", "<repo>#<n> id=<id>",
  exit, reason)`, stores the reason as the conversation's agent turn, and
  passes `ask`, the facts and `env` to `maybePostWatchSummary`. The
  spawn-outcome JSONL keeps `scrubSecrets(summary).slice(0, 240)`
  (operator-only).
- **Not changed**: a failed run with an ask (stuck ask → `Needs your input`,
  `noteWatchRunAsk` and its owner DM), spend-cap stops (exit 0), successful
  runs, the ack, the injection notice, the rate-limit backoff, SAFE-12
  fencing of the event prompt and the replayed block.
- **REQ-cli-079**: text only — it now says what #340's scheduler records for
  a daemon run; a test pins it.

## From the change's testing.md

# Testing

Stub agents, `startWatchPoller` with the echo ack client and an in-memory
DB, the WATCH spawn client running the real `task run` against a localhost
model that answers 429 with an org name (`org-acme-widgets-7731`) and a
request id (`req_7f3c9a1b2d4e5f60`) in its body, and a `startDaemon` whose
spawn runs the real `task run` with no model. No network, no real key or
token, and no test runs the repo's own verify lane.

Fail-on-main proof: with main's (aeb2de3) four modified sources swapped in
(`src/watch/{agent-client,poller,summary,types}.ts`),
`bun test tests/watch.failed-comment.test.ts` does not load
(`watchFailureReason` is missing: 0 pass, 1 fail); with a one-line stub
export added so it loads, 2 pass and 5 fail — the end-to-end comment is
`LLM HTTP 429: {"error":{"message":"Rate limit reached for gpt-4o-mini in
organization org-acme-widgets-7731 …"},"request_id":"req_7f3c9a1b2d4e5f60"}`;
the two that pass are the unchanged success and ask / spend-cap cases.
Restored: 7 pass, 0 fail. `tests/daemon.no-provider-run.test.ts` passes on
main too: it pins #340's behaviour, which REQ-cli-079's text had not caught
up with.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` ("end to end: a real `task run` whose model answers 429 …") | The summary comment is exactly the `Failed (exit 1).` status, `The model call failed (429 Too Many Requests)` (no host — the log line keeps it, amended by the host change in this PR) and the footer; no comment or log line has the org name, the request id or `LLM HTTP`; `[watch] run failed (CorvidLabs/Corvidinho#42 id=comment-failed-e2e, exit 1): …` is logged; the spawn log's `summaryPreview` keeps `LLM HTTP 429: …` (operator-only). Fails on main. |
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` ("… even with no result `error` …", "a spawn that throws …") | A crash's comment is its scrubbed stderr end (`…/x.ts`, `[redacted:github-token]`), a silent failure `The run failed (exit 2) without saying why`; a thrown spawn's comment and log line are its scrubbed one-line message with no exit code. Fails on main. |
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` ("success is unchanged …", "a failed run that stopped on an ask …") | A successful run posts its summary and logs no `run failed`; a stuck ask's failed run keeps `Needs your input: …`; a spend-cap stop keeps "Work is paused for budget.". |
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` ("watchFailureReason / buildSummaryBody") | Order: the result's `error`, the no-provider notice, the stderr end, the exit code (130 interrupted); null on success or an ask; the SAFE-13 owner line and the footer stay. |
| `REQ-watch-009` | `tests/watch.reliability.test.ts` ("poller posts ack then summary once for success and failure"); `tests/watch.summary-scrub.test.ts` | A failed run's comment has its reason line, not the run's "agent blew up"; the stderr fallback's reason is scrubbed; a token straddling the 500-char stderr clip leaves no `ghp_` in a successful run's summary or a failed run's 200-char reason. |
| `REQ-watch-472` | `tests/watch.failed-comment.test.ts` ("end to end …", "success is unchanged …") | The failed run's kept agent turn is the reason line and the stored turns never hold the org name; a successful run's turn is its summary. `tests/watch.conversation.test.ts` passes unchanged. |
| `REQ-watch-080` | `tests/agent.fallback.test.ts` ("the WATCH spawn client logs one [watch] llm.fallback warn line …") | Unchanged: the WATCH client's summary keeps the note and the warn line is logged; a failed run's comment is its reason line (`tests/watch.failed-comment.test.ts`). |
| `REQ-cli-079` | `tests/daemon.no-provider-run.test.ts` | A daemon with no model: the owner's schedule's row `summary` is the notice, another creator's `That didn't work.`, both `error` `failed (exit 1): <notice>`; both `run.finished` are `warn` with `ok: false` and that error; `[scheduler] run failed (schedule <id>, exit 1): <notice>` is logged for each. `tests/agent.providers.test.ts` still covers `llm.no_provider` and `daemon.started`. |

## Automated coverage

- `tests/watch.failed-comment.test.ts` (7 tests), `tests/daemon.no-provider-run.test.ts` (1 test).
- Updated for the new line: `tests/watch.summary-scrub.test.ts`, `tests/watch.reliability.test.ts`.
- Unchanged suites that cover the touched files still pass (`bun test`, all files).

## Where these lessons go

- `specs/watch/context.md`
- `specs/cli/context.md`
