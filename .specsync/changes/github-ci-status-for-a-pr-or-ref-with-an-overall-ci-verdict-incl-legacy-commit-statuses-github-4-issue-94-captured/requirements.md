---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: requirements
---

# Requirements

### REQ-plugins-094

`github-ci-status` SHALL report CI state for either a PR number or a ref
(branch, tag or commit SHA) (GITHUB-4). A selector of 1–9 digits SHALL be a
PR number (its head SHA is queried); any other selector SHALL be a ref that
passes git ref-name rules, and option-looking values (leading `-`) SHALL be
refused before any API call. The result SHALL carry an overall `verdict`:
`red` when any check run concluded failure/cancelled/timed_out/
action_required or any commit status is failure/error; otherwise `pending`
when any check or status is queued/in progress/pending or has no
recognised conclusion; otherwise `green` when every row succeeded, was
skipped or was neutral; `none` when there are no check runs and no commit
statuses. Legacy combined commit statuses
(`repos.getCombinedStatusForRef`) SHALL count toward the verdict. A ref
SHALL be resolved to one commit SHA (`repos.getCommit`) before listing, and
check runs and commit statuses SHALL both be read for that SHA (a PR uses
its head SHA), so one verdict never mixes two commits. When paging stops at
the cap (`truncated: true`) a verdict that would be `green` SHALL be
reported as `pending`. A 403 on commit statuses that denies the permission
SHALL degrade to check runs only with a warning; a rate-limit (primary or
secondary) or SSO/SAML 403 SHALL fail the command instead. Warnings SHALL be
included in the one-line message for every verdict, `none` included.
Per-check rows SHALL keep `name`, `state`, `bucket`, `link` (additive fields
only). The command SHALL stay `dangerous: false`, `minTier: 0`, behind the
`--repo` gate (GITHUB-6).

Acceptance Criteria
- `github-ci-status 12 --repo O/R` queries the PR head SHA; `main`, `v1.2.3`, a SHA and `heads/123` are queried as refs.
- `--flag`-looking and invalid refs (`a..b`, spaces, `x.lock`, `@{`) are refused with exit 1 before a token or API call.
- Verdict is green / red / pending / none per the rules above, with red winning over pending.
- A repo that only reports commit status contexts gets a verdict from them.
- A ref such as `main` is resolved once and every check-run and status page is read by that SHA; `data.sha` is the resolved SHA.
- A truncated listing whose seen rows all pass reports `pending`, not `green` (check runs or statuses hitting the cap); a seen failure stays `red`.
- A permission 403 on statuses gives a check-runs-only verdict plus a warning; a rate-limit or SSO 403 fails the command; the warning also shows for verdict `none`.
- Rows keep `name/state/bucket/link` and add `kind/status/conclusion`; `plugins list` still shows dangerous=false minTier=0; missing or denied `--repo` still exits 3.
- Tests use a mocked Octokit / stubbed transport only (no network, no real token).
