---
change: a-failed-github-watch-run-s-comment-says-why-in-one-plain-line-which-model-call-failed-status-and-host-never-the
artifact: testing
---

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
