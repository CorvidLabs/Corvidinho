---
id: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
state: archived
type: feature
base_commit: 92519c3c18fa98a6c895cb55196b5529b77c711b
---

# GitHub write plugins for assign→work→comment→PR dogfood (issue #48): dangerous github-issue-create/comment, github-pr-create with Made with Corvidinho attribution, github-pr-review; SAFE-1 CORVIDINHO_ALLOWLIST + GITHUB-6 repo gate; WATCH assignment events from assignees; SpecSync + fixtures no live tokens

## Intent

GitHub write plugins for assign→work→comment→PR dogfood (issue #48): dangerous github-issue-create/comment, github-pr-create with Made with Corvidinho attribution, github-pr-review; SAFE-1 CORVIDINHO_ALLOWLIST + GITHUB-6 repo gate; WATCH assignment events from assignees; SpecSync + fixtures no live tokens

## Affected Canonical Specs

- `plugins`
- `watch`

## Acceptance Criteria

- Dangerous github-issue-create, github-issue-comment, github-pr-create, github-pr-review plugins land with dangerous:true minTier:1; SAFE-1 denies them in non-interactive without CORVIDINHO_ALLOWLIST; empty GitHub repo allowlist still refuses writes (GITHUB-6/ALLOW-1); github-pr-create appends plain Made with Corvidinho attribution without @handles; WATCH emits assignment events when watch username is in assignees; fixture/dry-run tests pass with no live tokens; STATUS/WATCH.md document dogfood path; fledge lane verify + SpecSync green.

## No-spec Rationale

Not applicable
