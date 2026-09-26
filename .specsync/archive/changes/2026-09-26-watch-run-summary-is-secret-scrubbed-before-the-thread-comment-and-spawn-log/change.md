---
id: watch-run-summary-is-secret-scrubbed-before-the-thread-comment-and-spawn-log
state: archived
type: bug_fix
base_commit: 3af288a04306b7463f1275d4db93001ca51bede2
---

# WATCH run summary is secret-scrubbed before the thread comment and spawn log

## Intent

WATCH run summary is secret-scrubbed before the thread comment and spawn log

## Affected Canonical Specs

- `watch`

## Acceptance Criteria

- a WATCH run whose agent summary, stderr fallback or spawn error contains a vendor token (e.g. ghp_) posts a summary comment on the GitHub thread and appends a spawn-log JSONL line that hold [redacted:<kind>] and never the raw token or a clipped token prefix; token-free summaries are posted and logged unchanged

## No-spec Rationale

Not applicable
