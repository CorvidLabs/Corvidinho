---
id: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
state: implementing
type: feature
base_commit: 8747a9abb99c2322ea67c40da96fb60bc69172bc
---

# GitHub PR review reads (issue #93 captured slice, GITHUB-3 / GITHUB-1): read-only github-pr-diff (unified diff capped at 200 KiB with a truncation marker, optional --file PATH filter) and github-pr-files (changed files with status/additions/deletions, paginated to a cap) in plugins/github/review.ts; dangerous false, minTier 0, GITHUB-6 repo gate; SAFE-6 scrub on returned text; diff returned as untrusted data; draft GITHUB-10 confidence score left for HI capture

## Intent

GitHub PR review reads (issue #93 captured slice, GITHUB-3 / GITHUB-1): read-only github-pr-diff (unified diff capped at 200 KiB with a truncation marker, optional --file PATH filter) and github-pr-files (changed files with status/additions/deletions, paginated to a cap) in plugins/github/review.ts; dangerous false, minTier 0, GITHUB-6 repo gate; SAFE-6 scrub on returned text; diff returned as untrusted data; draft GITHUB-10 confidence score left for HI capture

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- github-pr-diff and github-pr-files are registered read-only typed plugins (dangerous false; minTier 0) behind the same --repo OWNER/REPO GITHUB-6 gate as the other github-* commands; github-pr-diff returns the PR unified diff via Octokit capped at 200 KiB with a clear truncation marker and an optional --file PATH filter; github-pr-files lists changed files with status/additions/deletions paginated up to a cap with a truncated flag; returned text is scrubbed with scrubSecrets (SAFE-6) and labelled as untrusted data; Octokit-mocked fixture tests need no network or token; draft GITHUB-10 confidence score is not built; SpecSync + fledge verify green

## No-spec Rationale

Not applicable
