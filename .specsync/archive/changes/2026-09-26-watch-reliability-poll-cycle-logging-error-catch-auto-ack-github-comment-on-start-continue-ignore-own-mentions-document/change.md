---
id: watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document
state: archived
type: bug_fix
base_commit: 4d83cc3995663588adc0a890389a3560c22853cd
---

# WATCH reliability: poll cycle logging + error catch, auto-ack GitHub comment on start/continue, ignore own mentions, document search pagination bury risk (flake harden for GH watch)

## Intent

WATCH reliability: poll cycle logging + error catch, auto-ack GitHub comment on start/continue, ignore own mentions, document search pagination bury risk (flake harden for GH watch)

## Affected Canonical Specs

- `watch`
- `cli`

## Acceptance Criteria

- Every poll cycle logs fetched/new/started/continued/refused/skipped; pollOnce errors are caught and logged (not swallowed by void); when start/continue from mention or issue_comment (sender !== watch username), post short GitHub ack comment with Made with Corvidinho footer once per event id; ignore own corvid-agent mentions/comments in searcher; docs/WATCH.md notes org search per_page=30 pagination bury risk; fixture tests cover logging/ack skip/own-mention skip without live tokens; SpecSync+fledge verify green

## No-spec Rationale

Not applicable
