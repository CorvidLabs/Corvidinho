---
change: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
artifact: testing
---

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
