---
change: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
artifact: context
---

# Context

PR #190 (REQ-watch-231) made WATCH scrub the run summary before its own clips
(1200-char thread comment, 240-char spawn-log preview). A blocker review then
found that the text WATCH receives has already been clipped once, unscrubbed,
by the shared run-summary helpers:

- `chatBodyFromTaskRunOutput` / `summarizeTaskRunOutput` clip the stderr
  fallback to 500 chars and non-frame stdout to 1800 chars.
- `chatBodyFromTaskResult` clips the result summary to 1800 chars.
- The child's `resultFrame` caps the summary at 4000 chars before it is sent.

A clip can cut a secret into a shape `scrubSecrets` no longer matches. A
`ghp_` token starting at stderr char 477 reached the public WATCH comment as
`ghp_` plus 19 chars (the pattern needs 20). A PEM private key that starts
before 1800 and ends after it loses its END line, and the private-key pattern
needed the END line, so the header and about 1.1k chars of key body were
posted. Discord replies and delegate summaries go through the same helpers, so
the same holes applied there (Discord replies are public too, SAFE-6).

Constraints: bug fix only. No new env var, command, table or column. Reuse
`scrubSecrets`. Text with no secret must come out exactly as before.
REQ-discord-066 notes that broader outbound reply scrubbing is draft SAFE-10;
this change only covers the spawned-run summary text these helpers produce.
