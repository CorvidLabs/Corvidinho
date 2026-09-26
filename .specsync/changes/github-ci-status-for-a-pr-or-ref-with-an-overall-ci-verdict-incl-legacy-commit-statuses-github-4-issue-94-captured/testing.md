---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-094 | `tests/github.ci-status.test.ts`: selector (PR digits vs branch/tag/SHA/`heads/123`), option-looking + git ref-name refusals; verdict green/red/pending/none incl. red-over-pending, stale ⇒ pending, legacy statuses; row fields kept + added; mocked-Octokit fetch for PR (head SHA) and ref (no `pulls.get`), status-only repo, paging + cap, statuses 403 warning, error propagation; handler: dangerous=false minTier=0, `--repo` gate exit 3, usage/extra-arg refusals before token use, end-to-end through Octokit with a stubbed `fetch` and a fixture token |

No network and no real token: the fake Octokit and the stubbed transport
serve fixtures in-process.

Commands: `bun test tests/github.ci-status.test.ts`, `bun test`,
`bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.
