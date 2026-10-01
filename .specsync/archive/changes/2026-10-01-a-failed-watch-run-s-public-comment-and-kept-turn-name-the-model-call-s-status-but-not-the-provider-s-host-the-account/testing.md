---
change: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
artifact: testing
---

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
