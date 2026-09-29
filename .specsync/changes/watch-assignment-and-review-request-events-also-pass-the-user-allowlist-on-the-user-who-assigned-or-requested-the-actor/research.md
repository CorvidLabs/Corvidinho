---
change: watch-assignment-and-review-request-events-also-pass-the-user-allowlist-on-the-user-who-assigned-or-requested-the-actor
artifact: research
---

# Research

- GitHub issue events (`GET /repos/{o}/{r}/issues/{n}/events`, Octokit
  `issues.listEvents`) include `assigned` events with `assignee` +
  `assigner` and, on PRs, `review_requested` events with
  `requested_reviewer` + `review_requester` (`@octokit/openapi-types`
  `assigned-issue-event` / `review-requested-issue-event`); `actor` is
  "the person who generated the event". Team review requests carry
  `requested_team` and no `requested_reviewer`.
- The list is oldest-first and paginated like issue comments, so the newest
  event can sit on the last page; the comment reader already solves that
  (page 1 + newest pages via `rel="last"`, 10-page cap, REQ-watch-234).
- The events endpoint needs the same read access as issue comments, so no new
  token scope.
- Only two `SearchClient` implementations exist (fixture, Octokit); no test
  or product code builds its own, so a required method is safe.
- `isGithubUserAllowed` already checks `deny_users` first (deny wins), so
  running it on the actor gives "deny lists win" for free.
- `preferAllowlisted` runs before `dedupeByIssue`; if only `routeEvent`
  checked the actor, a newer refused assignment could win the per-issue
  dedupe and mark a trusted comment on the same issue processed. The gate has
  to be in both.
