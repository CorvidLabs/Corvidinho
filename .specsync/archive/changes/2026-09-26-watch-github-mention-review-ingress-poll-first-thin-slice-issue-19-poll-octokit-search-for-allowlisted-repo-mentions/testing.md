---
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
artifact: testing
---

# Testing

## Local gates

- `bun test` (router allow/deny, dedup, poller fixture→session, config fail-start)
- `bunx tsc --noEmit`
- `bun src/cli.ts github watch` without token → clean non-zero exit
- `specsync check`
- `fledge lanes run verify --non-interactive`

## CI

Bun smoke/test/typecheck + Spec Sync Action. No live webhook secrets required.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-001 | `docs/WATCH.md` + STATUS document poll-first |
| REQ-watch-002 | `tests/watch.poller.test.ts` fixture events → start/continue session |
| REQ-watch-003 | `tests/watch.router.test.ts` deny user/repo quiet refuse; allow starts |
| REQ-watch-004 | `tests/watch.config.test.ts` + `tests/watch.cli.test.ts` missing token/empty allow |
| REQ-watch-005 | `tests/watch.poller.test.ts` dedup skips already-processed ids |
| REQ-cli-watch-001 | `tests/watch.cli.test.ts` github watch clean exit + help mentions watch |
