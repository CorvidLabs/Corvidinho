---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: design
---

# Design

- New `plugins/github/ciStatus.ts` holds pure helpers against a structural
  `CiOctokit` type (the real `Octokit` satisfies it), so tests pass a fake
  client: `parseCiSelector`, `validateCiRef`, `checkRunRow`,
  `commitStatusRow`, `ciVerdict`, `countBuckets`, `fetchCiStatus`,
  `ciStatusMessage`.
- The `github-ci-status` handler in `commands.ts` keeps `requireRepo` (repo
  gate) first, validates the selector before creating a client (bad input
  never needs a token), lazy-loads `ciStatus.ts`, and returns the verdict in
  both `data` and `message` (message is also set under `--json` so the agent
  tool loop sees the one-line summary).
- Selector: 1–9 digits ⇒ PR number (`pulls.get` ⇒ head SHA); anything else ⇒
  ref after validation. Digits-only branches/tags are named `heads/<n>` /
  `tags/<n>`; 10+ digit selectors are treated as (short) SHAs.
- Pinning: a ref is resolved once with `repos.getCommit` (`per_page: 1`, so
  the file list stays small) and both listings are read by that SHA, never
  by the moving branch name. `data.sha` is that resolved SHA (or the PR head
  SHA). An unknown ref fails at resolution, before any listing.
- Rows keep `name/state/bucket/link` and add `kind` (`check`/`status`),
  `status`, `conclusion`. Buckets: success ⇒ pass; skipped/neutral ⇒
  skipping (was mis-bucketed as fail); failure/cancelled/timed_out/
  action_required ⇒ fail; no conclusion or unknown (e.g. stale) ⇒ pending.
  Statuses: success ⇒ pass; failure/error ⇒ fail; else pending.
- Verdict precedence: none (no rows) → red (any fail) → pending (any
  pending) → green. Unknown states never count as green.
- `data` becomes `{ target, pr, ref, sha, verdict, counts, checks, truncated,
  warnings }`; the old per-check list lives under `data.checks` unchanged.
- Paging: 100 per page, stop on a short page or `total_count`, hard cap 10
  pages per source (`truncated: true` + warning). Unlisted rows may fail, so
  a truncated listing whose seen rows would give `green` reports `pending`
  (the warning says so); `red` stays `red`.
- A 403 on commit statuses that denies the permission (token without that
  scope) degrades to check runs only with a warning
  (`isStatusesPermissionDenied`). A 403 that is a primary rate limit
  (`x-ratelimit-remaining: 0`), a secondary rate limit (`retry-after`, or a
  rate-limit / abuse message) or SSO/SAML enforcement (`x-github-sso`, or a
  SAML/SSO message) fails the command, since the statuses were only unread
  and a legacy `failure` context could hide behind a `green`. Every other
  error fails as before.
- `ciStatusMessage` appends warnings for every verdict, including `none`.
