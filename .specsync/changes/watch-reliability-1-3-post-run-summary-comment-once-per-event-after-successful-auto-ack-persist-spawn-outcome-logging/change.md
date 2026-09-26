---
id: watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging
state: approved
type: feature
base_commit: 20fb34ff8db5759a2aad968e74d1d21b4c344b83
---

# WATCH-RELIABILITY-1..3: post-run summary comment once per event after successful auto-ack; persist spawn outcome logging; GitHub 403 rate-limit backoff with Retry-After/reset; package 0.0.10

## Intent

WATCH-RELIABILITY-1..3: post-run summary comment once per event after successful auto-ack; persist spawn outcome logging; GitHub 403 rate-limit backoff with Retry-After/reset; package 0.0.10

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- WATCH-RELIABILITY-1: after successful auto-ack on mention/comment start/continue, when agent run finishes post short summary comment on same GitHub thread (success or failure) once per event id with Made with Corvidinho footer. WATCH-RELIABILITY-2: persist spawn outcome (start, exit code/error class, duration_ms) via structured log line and durable JSONL store readable without Discord. WATCH-RELIABILITY-3: on GitHub 403 rate-limit back off using Retry-After or x-ratelimit-reset (default 60s) before next poll; no tight loop; clear [watch] rate-limit log line. HI captured in hi/watch.md (not draft). Package 0.0.10. Fixture tests cover summary once-per-event, spawn outcome log/store, and backoff parsing. SpecSync+fledge verify green.

## No-spec Rationale

Not applicable
