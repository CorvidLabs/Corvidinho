# Lesson bundle — watch-reliability-1-3-post-run-summary-comment-once-per-event-after-successful-auto-ack-persist-spawn-outcome-logging

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH-RELIABILITY-1..3: post-run summary comment once per event after successful auto-ack; persist spawn outcome logging; GitHub 403 rate-limit backoff with Retry-After/reset; package 0.0.10
- **Kind**: Feature
- **Specs**: watch
- **Paths**: src/watch, tests, hi, docs/WATCH.md, STATUS.md, package.json, CHANGELOG.md
- **Acceptance**: WATCH-RELIABILITY-1: after successful auto-ack on mention/comment start/continue, when agent run finishes post short summary comment on same GitHub thread (success or failure) once per event id with Made with Corvidinho footer. WATCH-RELIABILITY-2: persist spawn outcome (start, exit code/error class, duration_ms) via structured log line and durable JSONL store readable without Discord. WATCH-RELIABILITY-3: on GitHub 403 rate-limit back off using Retry-After or x-ratelimit-reset (default 60s) before next poll; no tight loop; clear [watch] rate-limit log line. HI captured in hi/watch.md (not draft). Package 0.0.10. Fixture tests cover summary once-per-event, spawn outcome log/store, and backoff parsing. SpecSync+fledge verify green.

## Evidence

- Verification commit: `4a8f74866708d82ec212680b2ed6bce1dccc0b1d`
- Base commit: `20fb34ff8db5759a2aad968e74d1d21b4c344b83`
- Verified by: `specsync check --spec agent --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

# Context

WATCH already ships REQ-watch-007 (poll counters, auto-ack, ignore own mentions).
Leif confirmed draft `docs/hi-drafts/WATCH-RELIABILITY.md` → live `hi/watch.md`
criteria **WATCH-RELIABILITY-1..3** (2026-09-26): post-run summary after successful
auto-ack, persist spawn outcomes without Discord, and back off cleanly on GitHub
403 rate-limit.

Constraints: Corvidinho-only; poll-first remains default (no webhook); no new
allowlist semantics; Made with Corvidinho attribution on outbound comments;
eager package bump to **0.0.10** (tip already at 0.0.9; open #140 also claims 0.0.9).

## From the change's design.md

# Design

- **Summary (RELIABILITY-1):** `src/watch/summary.ts` — `SuccessfulAckStore` records
  event ids whose auto-ack `posted===true`; after `agent.runChat` finishes,
  `maybePostWatchSummary` posts via the same injectable `AckClient`, gated by
  successful ack + `SummarizedIdStore` once-per-id. Reuses Made with Corvidinho footer.
- **Spawn log (RELIABILITY-2):** `src/watch/spawn-log.ts` — structured start/outcome
  lines; `SpawnOutcomeStore` appends JSONL under `resolveDataDir()/watch-spawn.jsonl`
  (or `CORVIDINHO_WATCH_SPAWN_LOG`). Error classes: `ok` | `exit_nonzero` | `spawn_throw`.
- **Backoff (RELIABILITY-3):** `src/watch/rate-limit.ts` — parse 403/429 + headers;
  `GithubRateLimitError`; poller tracks `backoffUntilMs`, skips fetch while hot,
  reschedules via `setTimeout` with `max(interval, remaining backoff)`. Octokit
  search client rethrows rate-limit via `asGithubRateLimitError`.
- **HI:** live `hi/watch.md`; draft pointer `docs/hi-drafts/WATCH-RELIABILITY.md` marked captured.
- Package **0.0.10**. No webhook / allowlist / ProcessManager changes.

## From the change's testing.md

# Testing

- Unit: `computeRateLimitBackoffMs` / `parseGithubRateLimit` header preference + default 60s.
- Unit: `maybePostWatchSummary` requires successful ack; once per event id.
- Unit: `SpawnOutcomeStore` JSONL append; `classifySpawnError`.
- Poller integration: rate-limit fetch → backoff log + skip re-poll; ack+summary on spawn; spawn outcome records.
- No live GitHub tokens in CI.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-009 | `tests/watch.reliability.test.ts` (summary once-per-event + poller ack/summary) |
| REQ-watch-010 | `tests/watch.reliability.test.ts` (spawn outcome log + JSONL) |
| REQ-watch-011 | `tests/watch.reliability.test.ts` (backoff parse + poller skip) |

## Automated coverage

- `bun test tests/watch.reliability.test.ts tests/watch.ack.test.ts tests/watch.poller.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/watch/context.md`
