---
change: a-failed-delegate-worker-or-council-voice-hands-its-lead-one-plain-failure-line-the-worker-s-result-error-without-the
artifact: testing
---

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
