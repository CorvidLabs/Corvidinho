# Lesson bundle — a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A failed WATCH run's public comment and kept turn name the model call's status but not the provider's host (the account's resource name, a private gateway or an Ollama server's address); the [watch] run failed log line keeps the host
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/summary.ts, src/watch/poller.ts, tests/watch.failed-comment.test.ts, docs/WATCH.md, specs/watch/watch.spec.md, specs/watch/testing.md
- **Acceptance**: Through startWatchPoller and the real task run against a localhost model that answers 429 with an org name and a request id, the failed run's summary comment is exactly 'Corvidinho WATCH run summary — Failed (exit 1).', 'The model call failed (429 Too Many Requests)' and the footer, with no host, org name, request id or 'LLM HTTP'; the thread's kept agent turn is that same host-free line; the watcher still logs '[watch] run failed (<repo>#<n> id=<id>, exit 1): The model call failed (429 Too Many Requests from 127.0.0.1:<port>)' for the owner. watchPublicFailureLine drops the host from every modelCallFailedLine shape (an HTTP status, a timeout, a network error, a malformed reply, no failure detail; a host cut by the 200-char cap) and leaves every other reason (the no-key line, the no-provider notice, a stderr line, the exit-code line) as it is. A successful run, a failed run with an ask and a spend-cap stop are unchanged. The new public-line tests fail on the branch head before this change and pass after it; REQ-cli-079 is unchanged.

## Evidence

- Verification commit: `86e4acac1a2ddd8cf145053363079c1dd509b3e4`
- Base commit: `58c327f70e90258f02bc8dd49a46d436c57a4f86`
- Verified by: `specsync check --spec watch`

## From the change's context.md

# Context

Found in the adversarial review of PR #343 (branch
`claude/fix-watch-failed-comment`, head 58c327f). That PR stopped a failed
WATCH run's public GitHub comment from posting `LLM HTTP <status>: <provider
body>` and posts #340's DISCORD-3.b reason line instead. The reason line for a
model failure is `modelCallFailedLine` (`src/agent/providers.ts`): `The model
call failed (429 Too Many Requests from <host>)`, where `<host>` is
`providerId(provider)` — the host of `CORVIDINHO_LLM_BASE_URL` or
`OLLAMA_HOST`.

On Discord only the owner ever sees that line (anyone else gets "That didn't
work — the owner has been told.", #340). A WATCH thread is public, and the
docs invite any OpenAI-compatible gateway as the base URL, so the host can be
the account's own resource name (`<resource>.openai.azure.com`), a private
gateway's name or an Ollama server's address (Ollama takes no key). Main
never put the host on the thread (`LLM HTTP …` has none); #343 would.

Ruled out: carrying a second, host-free `error` in the result frame (a
protocol change for every surface); stripping every configured provider host
from any text (needs the child's exact env and still words lines oddly). The
line's shapes are fixed harness text, so WATCH drops the host from them.

## From the change's design.md

# Design

- `src/watch/summary.ts`: `watchPublicFailureLine(reason)` matches the
  `modelCallFailedLine` shapes — `The model call failed|timed out (` … `)`
  ending in `from <host>`, `reaching <host>` or a bare `(<host>)`, or in a
  host the 200-char cap cut (`…`) — and returns the line without the host
  (`The model call failed (429 Too Many Requests)`, `The model call timed
  out`, `… (network error)`, `… (malformed reply)`, `The model call failed`).
  A host has no spaces, so the no-key line (`(<model> needs <ENV>, which is
  not set)`) never matches; every other reason is returned as is.
- `buildSummaryBody` posts `watchPublicFailureLine(watchFailureReason(…))`
  for a failed run without an ask; nothing else in the body changes.
- `src/watch/poller.ts`: the `[watch] run failed …` log line keeps the full
  reason (with the host) for the owner; the kept agent turn is the public
  line, since a kept turn is replayed to the model and a later public comment
  could repeat it.
- Not changed: `watchFailureReason`, `failureReasonFor`, Discord surfaces,
  the result frame, successful runs, asks, spend-cap stops, the spawn JSONL.

## From the change's testing.md

# Testing

`tests/watch.failed-comment.test.ts` (8 tests): stub agents, the echo ack
client, an in-memory DB and the real `task run` through the WATCH spawn
client against a localhost model that answers 429 with an org name and a
request id; no network, no real key or token.

Fail-before proof: with the branch head's (58c327f)
`src/watch/{summary,poller}.ts` swapped in, the file does not load
(`watchPublicFailureLine` is missing); with a pass-through stub export added,
5 pass and 3 fail — the end-to-end comment is `The model call failed (429
Too Many Requests from 127.0.0.1:<port>)`, the `buildSummaryBody` line names
`acme-prod.openai.azure.com`, and every shape keeps its host. Restored: 8
pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` ("end to end: a real `task run` whose model answers 429 …") | The comment is exactly the `Failed (exit 1).` status, `The model call failed (429 Too Many Requests)` and the footer; no comment has `127.0.0.1:<port>`, the org name, the request id or `LLM HTTP`; the log line is `[watch] run failed (CorvidLabs/Corvidinho#42 id=comment-failed-e2e, exit 1): The model call failed (429 Too Many Requests from 127.0.0.1:<port>)`. Fails on the branch head. |
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` ("a failed run's body is the reason line without the host …") | With a reason naming `acme-prod.openai.azure.com` the body's line has no host; the SAFE-13 owner line and the footer stay. Fails on the branch head. |
| `REQ-watch-009` | `tests/watch.failed-comment.test.ts` ("the public line drops the provider's host from every model-call shape …") | Every `modelCallFailedLine` shape with host `acme-prod.openai.azure.com:8443` loses it (429, 599, timeout, network error, malformed reply, no detail), a host cut by the 200-char cap too; the no-key line, the no-provider notice, a verify line, a stderr line and the exit-code lines are unchanged. Fails on the branch head. |
| `REQ-watch-472` | `tests/watch.failed-comment.test.ts` ("end to end …", "success is unchanged …") | The failed run's kept agent turn is `The model call failed (429 Too Many Requests)` and the stored turns never hold the host or the org name; a successful run's turn is its summary. |

## Automated coverage

- `tests/watch.failed-comment.test.ts` (8 tests); the rest of the suite
  (`bun test`) passes unchanged.

## Where these lessons go

- `specs/watch/context.md`
