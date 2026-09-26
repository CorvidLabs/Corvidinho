---
id: github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists
state: archived
type: bug_fix
base_commit: ea2c970cab0297f0e75f7b0e78e2598222cd687f
---

# GitHub plugin repo gate reads the allowlist file plus env overlays so file deny lists apply and file-only allow lists work (GITHUB-6, ALLOW-4)

## Intent

GitHub plugin repo gate reads the allowlist file plus env overlays so file deny lists apply and file-only allow lists work (GITHUB-6, ALLOW-4)

## Affected Canonical Specs

- `plugins`
- `discord`

## Acceptance Criteria

- With deny_repos/deny_orgs only in the allowlist file and the allow list only in env, every GitHub plugin (issue/PR create, comment, review, reads) and the /work PR step refuse the denied repo or org with exit 3 / repo-denied; with an allow list only in the file, allowed repos pass and unlisted repos are still refused

## No-spec Rationale

Not applicable
