# Lesson bundle — watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH run summary is secret-scrubbed before the thread comment and spawn log
- **Kind**: BugFix
- **Specs**: watch
- **Paths**: src/watch/summary.ts, src/watch/poller.ts, tests/watch.summary-scrub.test.ts
- **Acceptance**: a WATCH run whose agent summary, stderr fallback or spawn error contains a vendor token (e.g. ghp_) posts a summary comment on the GitHub thread and appends a spawn-log JSONL line that hold [redacted:<kind>] and never the raw token or a clipped token prefix; token-free summaries are posted and logged unchanged

## Evidence

- Verification commit: `3d8f2ee5d6f2b75c1f2309ceca17580f84f54e36`
- Base commit: `3af288a04306b7463f1275d4db93001ca51bede2`
- Verified by: `specsync check --spec watch`

## From the change's context.md

# Context

A review of WATCH found that the post-run summary went out unscrubbed. When an
allowlisted @mention starts a run, `maybePostWatchSummary` posts up to 1200
chars of the agent summary as an issue comment, and that comment is public on
public repos. The poller also appends a 240-char `summaryPreview` to the
durable `watch-spawn.jsonl`. The summary is agent output: the result-frame
summary, the child's stderr when no result frame parses, or a thrown spawn
error message. The child inherits `GITHUB_TOKEN` through `...process.env`, so
a model that quotes env or shell output can put a token in it. Neither sink
called `scrubSecrets`. The scheduler does scrub the same kind of field before
persisting it (`schedule_runs.summary` via `scrubOpt`). This breaks SAFE-6 and
the AGENTS.md Secrets rule (secrets stay out of logs).

Constraints: bug fix only. No new env vars, commands or config. Reuse
`scrubSecrets` from `src/store/scrub.ts`, the same patterns as the DB scrub.

## From the change's design.md

# Design

Scrub at the two WATCH sinks, and scrub before clipping at each one:

1. `buildSummaryBody` (public thread comment):
   `scrubSecrets(spawn.summary || "").trim().slice(0, 1200)`. This covers every
   caller of `maybePostWatchSummary`, whatever produced the summary.
2. Poller spawn outcome (durable JSONL):
   `summaryPreview: scrubSecrets(spawnSummary).slice(0, 240)`.

A secret becomes `[redacted:<kind>]`. Text with no secret is unchanged
(`scrubSecrets` is idempotent and leaves ordinary text alone), so the ack,
dedup, once-per-event and status line behaviour do not change. No new public
API, env var or command. There is no schema change: the JSONL field keeps the
same name and type.

## From the change's testing.md

# Testing

`tests/watch.summary-scrub.test.ts` drives one allowlisted `issue_comment`
through `startWatchPoller` in dry-run mode with an echo ack client and a
`SpawnOutcomeStore` on a temp JSONL path. The agent is either a sh fake of the
corvidinho bin run through `createSpawnAgentClient`, or an injected
`AgentClient`. The fake token is built at runtime (`"ghp_" + ...`). There is
no network, no live token and no git worktree.

On the old code all 4 tests fail: the posted summary comment and the JSONL line
hold the raw `ghp_` token, and the clip test finds a leaked `ghp_AbCd`
prefix. After the fix all 4 pass, and the rest of `bun test` stays green,
including the existing WATCH-RELIABILITY-1/2 summary and spawn-log tests.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-watch-231` | `tests/watch.summary-scrub.test.ts` › token in the agent result frame is redacted in the posted summary and spawn log | A fake bin emits a result frame with summary `Used GITHUB_TOKEN=ghp_…`. The posted summary comment contains `GITHUB_TOKEN=[redacted:github-token]` and no `ghp_` token, and neither does the `watch-spawn.jsonl` line. |
| `REQ-watch-231` | `tests/watch.summary-scrub.test.ts` › token in the stderr fallback (no result frame) is redacted too | A fake bin writes the token to stderr and exits 1 with no stdout. The `Failed (exit 1)` comment and the JSONL line hold `[redacted:github-token]` and no raw token. |
| `REQ-watch-231` | `tests/watch.summary-scrub.test.ts` › token in a thrown spawn error is redacted in the posted summary and spawn log | An injected `AgentClient` throws an error whose message holds the token. The comment and the JSONL line are redacted. |
| `REQ-watch-231` | `tests/watch.summary-scrub.test.ts` › scrub runs before clipping, so a token cut at the length cap leaks no prefix | A token starts 8 chars before the 1200-char comment cap, and in another run before the 240-char preview cap. Neither the body nor the JSONL contains `ghp_`. |
| `REQ-watch-009` / `REQ-watch-010` (unchanged) | `tests/watch.reliability.test.ts` | The existing summary and spawn-log tests still pass, so token-free summaries are posted and logged unchanged. |

## Where these lessons go

- `specs/watch/context.md`
