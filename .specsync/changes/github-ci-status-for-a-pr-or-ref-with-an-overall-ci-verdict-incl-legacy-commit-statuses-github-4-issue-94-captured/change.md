---
id: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
state: draft
type: feature
base_commit: 8747a9abb99c2322ea67c40da96fb60bc69172bc
---

# Github-ci-status for a PR or ref with an overall CI verdict incl. legacy commit statuses (GITHUB-4, issue #94 captured slice)

## Intent

github-ci-status for a PR or ref with an overall CI verdict incl. legacy commit statuses (GITHUB-4, issue #94 captured slice)

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- github-ci-status accepts a PR number or a ref (branch, tag, commit SHA) with git ref-name validation and option-looking values refused; result data carries verdict green/red/pending/none computed from check runs plus legacy combined commit statuses; per-check rows keep name/state/bucket/link and add kind/status/conclusion; stays dangerous=false minTier 0 behind the --repo gate; mocked-Octokit tests green without network or tokens

## No-spec Rationale

Not applicable
