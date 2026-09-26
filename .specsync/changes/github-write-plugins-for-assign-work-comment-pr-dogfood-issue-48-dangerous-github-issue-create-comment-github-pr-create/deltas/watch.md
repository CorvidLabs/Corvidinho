---
module: watch
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
---

# Delta — watch (assignment ingress #48)

## Modified

### SPEC SECTION Purpose

Thin GitHub WATCH poll ingress: Octokit/fixture search → allowlist gate →
session stub for mention / issue_comment / review_request / assignment on
allowlisted targets (ALLOW-1). Assignment when watch username is in issue/PR
assignees (#48). Poll-first for bot/VM; webhook deferred.

### SPEC SECTION Behavioral Examples

Allowlisted mention or assignment→start_session; same repo#number→continue_session;
non-allowlisted user/repo→refuse quiet; duplicate id→skip; missing token /
empty repos refuse start cleanly.

### SPEC SECTION Change Log

| 2026-09-26 | github-write-plugins-issue-48: WATCH assignment events from issue/PR assignees |

### REQUIREMENT REQ-watch-048

WATCH SHALL emit an assignment DetectedEvent when the watch username appears in
issue/PR assignees from search results, using the same allowlist → session path
as mentions.

Acceptance Criteria
- Fixture with assignees includes assign-owner/repo#n event type assignment.
