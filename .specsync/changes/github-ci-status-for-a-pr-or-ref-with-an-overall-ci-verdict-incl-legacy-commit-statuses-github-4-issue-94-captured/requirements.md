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
(`repos.getCombinedStatusForRef`) SHALL count toward the verdict. Per-check
rows SHALL keep `name`, `state`, `bucket`, `link` (additive fields only). The
command SHALL stay `dangerous: false`, `minTier: 0`, behind the `--repo`
gate (GITHUB-6).

Acceptance Criteria
- `github-ci-status 12 --repo O/R` queries the PR head SHA; `main`, `v1.2.3`, a SHA and `heads/123` are queried as refs.
- `--flag`-looking and invalid refs (`a..b`, spaces, `x.lock`, `@{`) are refused with exit 1 before a token or API call.
- Verdict is green / red / pending / none per the rules above, with red winning over pending.
- A repo that only reports commit status contexts gets a verdict from them.
- Rows keep `name/state/bucket/link` and add `kind/status/conclusion`; `plugins list` still shows dangerous=false minTier=0; missing or denied `--repo` still exits 3.
- Tests use a mocked Octokit / stubbed transport only (no network, no real token).
