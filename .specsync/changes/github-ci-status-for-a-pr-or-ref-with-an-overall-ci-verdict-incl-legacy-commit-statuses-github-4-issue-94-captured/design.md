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
  pages per source (`truncated: true` + warning).
- A 403 on commit statuses (token without that permission) degrades to check
  runs only with a warning; every other error fails as before.
