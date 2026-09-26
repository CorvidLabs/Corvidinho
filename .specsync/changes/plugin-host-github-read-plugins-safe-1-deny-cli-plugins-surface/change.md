---
id: plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface
state: implementing
type: feature
base_commit: bfd880ea9645d1444aa4e4cc11e7fcded4c35eb8
---

# WATCH: plugin host + GitHub read + repo deny gate

## Intent

WATCH slice: typed plugin host, GitHub read tools, SAFE-1 deny, GITHUB-6 repo gate, SpecSync SDD

## Affected Canonical Specs

- `plugins`
- `cli`

## Acceptance Criteria

- Typed plugin host list/run with danger/minTier; SAFE-1 deny in non-interactive; github-pr-list/status/ci-status/issue-list read-only via gh JSON; GITHUB-6 requires --repo and honors DENY/ALLOW env; CLI plugins list/run + doctor count; bun test + fledge verify green; Spec Sync CI green

## No-spec Rationale

Not applicable
