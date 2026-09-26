---
id: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
state: implementing
type: feature
base_commit: 9095c9e96aa26d8198d6a4a0c2fd33e0c4611acf
---

# WATCH GitHub mention/review ingress poll-first thin slice (issue #19): poll Octokit search for allowlisted repo mentions/review_requests/issue_comments → allowlist gate (ALLOW-1/2/5) before session stub; document poll-for-VM vs webhook-when-public-URL; fixture tests; no ProcessManager; webhook deferred follow-up; STATUS Done for #19

## Intent

WATCH GitHub mention/review ingress poll-first thin slice (issue #19): poll Octokit search for allowlisted repo mentions/review_requests/issue_comments → allowlist gate (ALLOW-1/2/5) before session stub; document poll-for-VM vs webhook-when-public-URL; fixture tests; no ProcessManager; webhook deferred follow-up; STATUS Done for #19

## Affected Canonical Specs

- `watch`
- `cli`

## Acceptance Criteria

- Documented poll-first for bot/VM (webhook when public URL) in docs/WATCH.md + STATUS. Event→session path for mention/review_request/issue_comment on allowlisted repos+users only (ALLOW-1/2); denied contacts refuse quietly (ALLOW-5) with no session spawn. Empty github allowlists fail-start poller. Fixture tests without live webhook secrets; Octokit-shaped injectable searcher; no ProcessManager; no auto-merge. CLI corvidinho github watch. Webhook deferred follow-up. STATUS Done cites #19→this PR. SpecSync + fledge verify green.

## No-spec Rationale

Not applicable
