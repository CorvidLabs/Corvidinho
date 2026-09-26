---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-094 | `tests/github.ci-status.test.ts`: selector (PR digits vs branch/tag/SHA/`heads/123`), option-looking + git ref-name refusals; verdict green/red/pending/none incl. red-over-pending, stale ⇒ pending, legacy statuses; row fields kept + added; mocked-Octokit fetch for PR (head SHA) and ref (no `pulls.get`; resolved once via `repos.getCommit`, both listings by that SHA even when the branch moves; unknown ref fails before listing), status-only repo, paging + cap for check runs and for statuses (all-pass truncated ⇒ pending, seen failure stays red), statuses permission 403 warning (also in the `none` message), rate-limit / secondary-limit / abuse / SSO 403s propagate, error propagation; handler: dangerous=false minTier=0, `--repo` gate exit 3, usage/extra-arg refusals before token use, end-to-end through Octokit with a stubbed `fetch` and a fixture token |

## Requirement evidence

| Requirement | Test | Evidence |
|-------------|------|----------|
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › selector | PR digits vs branch/tag/SHA/`heads/123`; option-looking and git ref-name refusals |
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › verdict | green/red/pending/none, red over pending, stale ⇒ pending, legacy statuses, row fields kept + added |
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › fetch (mocked Octokit) | PR head SHA; ref pinned via `repos.getCommit` (moving branch read at the resolved SHA only); status-only repo; paging cap for check runs and statuses (truncated all-pass ⇒ pending); permission 403 degrades with warning (also for `none`); rate-limit / SSO 403 propagate |
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › plugin handler | dangerous=false minTier=0; `--repo` gate exit 3; refusals before token use; end-to-end Octokit with stubbed `fetch` (resolve, then both listings by SHA) |

No network and no real token: the fake Octokit and the stubbed transport
serve fixtures in-process.

Commands: `bun test tests/github.ci-status.test.ts`, `bun test`,
`bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.
