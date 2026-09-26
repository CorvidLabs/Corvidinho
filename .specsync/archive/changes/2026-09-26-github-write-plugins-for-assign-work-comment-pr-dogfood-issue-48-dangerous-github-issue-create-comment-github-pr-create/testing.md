---
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
artifact: testing
---

# Testing

## Local gates

- `bun test` (incl. `tests/github.write.plugin.test.ts`, watch.poller assignment)
- `bunx tsc --noEmit` / `fledge lane verify`
- `specsync check`
- Dry-run writes with `CORVIDINHO_GITHUB_DRY_RUN=1` — no live token required

## CI

Bun test + Spec Sync Action. No live GITHUB_TOKEN required for write fixtures.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-048 | plugins list + write test "listed as dangerous" |
| REQ-plugins-049 | write test SAFE-1 deny without allowlist |
| REQ-plugins-050 | write test empty repo allowlist exit 3 |
| REQ-plugins-051 | dry-run pr-create attribution assertions |
| REQ-plugins-052 | dry-run paths succeed without Octokit token |
| REQ-watch-048 | watch.poller fixture expects assignment id |
| REQ-plugins-053 | docs/WATCH.md + STATUS.md updated |
