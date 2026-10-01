---
id: a-failed-watch-run-s-public-comment-and-kept-turn-name-the-model-call-s-status-but-not-the-provider-s-host-the-account
state: approved
type: bug_fix
base_commit: 58c327f70e90258f02bc8dd49a46d436c57a4f86
---

# A failed WATCH run's public comment and kept turn name the model call's status but not the provider's host (the account's resource name, a private gateway or an Ollama server's address); the [watch] run failed log line keeps the host

## Intent

A failed WATCH run's public comment and kept turn name the model call's status but not the provider's host (the account's resource name, a private gateway or an Ollama server's address); the [watch] run failed log line keeps the host

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- Through startWatchPoller and the real task run against a localhost model that answers 429 with an org name and a request id, the failed run's summary comment is exactly 'Corvidinho WATCH run summary — Failed (exit 1).', 'The model call failed (429 Too Many Requests)' and the footer, with no host, org name, request id or 'LLM HTTP'; the thread's kept agent turn is that same host-free line; the watcher still logs '[watch] run failed (<repo>#<n> id=<id>, exit 1): The model call failed (429 Too Many Requests from 127.0.0.1:<port>)' for the owner. watchPublicFailureLine drops the host from every modelCallFailedLine shape (an HTTP status, a timeout, a network error, a malformed reply, no failure detail; a host cut by the 200-char cap) and leaves every other reason (the no-key line, the no-provider notice, a stderr line, the exit-code line) as it is. A successful run, a failed run with an ask and a spend-cap stop are unchanged. The new public-line tests fail on the branch head before this change and pass after it; REQ-cli-079 is unchanged.

## No-spec Rationale

Not applicable
