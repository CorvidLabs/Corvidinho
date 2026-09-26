---
module: watch
change: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
---

# Delta — watch (run summary secret-scrubbed before the thread comment and spawn log)

## Added

### REQUIREMENT REQ-watch-231

The system SHALL pass the WATCH run summary through the SAFE-6 secret scrubber
(`scrubSecrets`) before posting it as the post-run summary comment on the
GitHub thread (REQ-watch-009) and before writing it as `summaryPreview` to the
durable spawn-outcome JSONL (REQ-watch-010). This applies whatever the summary
came from: the agent result frame, the stderr fallback, or a thrown spawn
error. The scrub SHALL run before the text is clipped to its length cap, so a
secret cut at the cap never leaks as a partial prefix. Text with no secret is
posted and logged unchanged (SAFE-6; AGENTS.md Secrets).

Acceptance Criteria
- A token-shaped value (e.g. `ghp_…`) in the agent summary, the stderr fallback or a spawn error is posted and logged as `[redacted:<kind>]`, never raw.
- A token that starts just before the 1200-char comment cap or the 240-char preview cap leaves no `ghp_` prefix in either sink.
- Fixture tests need no live GitHub token or network.
