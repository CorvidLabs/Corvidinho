---
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-093 | `tests/github.review.plugin.test.ts`: listed dangerous=false minTier=0; empty allowlist → exit 3; deny beats allow → exit 3 with no API call; non-interactive not SAFE-1 denied, missing token → exit 1; usage errors; diff happy path (accept header `diff`, untrusted label, human message); 200 KiB cap on a line boundary + marker; secret scrubbed and a token straddling the cap leaks no prefix; `--file` across two pages incl. rename, binary, not-found; 406 hint; files list across pages, totals, `--limit` truncation; `capUtf8` multi-byte boundary; `fileDiffSection` /dev/null headers |
| REQ-plugins-093 | `tests/plugins.list.smoke.test.ts`: `plugins list` shows `github-pr-diff` and `github-pr-files` |

All fixtures use a real `Octokit` over a mocked `fetch` — no network, no token.

Commands: `bun test tests/github.review.plugin.test.ts`, `bun test`,
`bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.
