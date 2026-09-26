---
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
artifact: testing
---

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-093 | `tests/github.review.plugin.test.ts`: listed dangerous=false minTier=0; empty allowlist → exit 3; deny beats allow → exit 3 with no API call; non-interactive not SAFE-1 denied, missing token → exit 1; usage errors; diff happy path (accept header `diff`, untrusted label, human message); 200 KiB cap on a line boundary + marker; secret scrubbed and a token straddling the cap leaks no prefix; hostile ~1.2 MiB diff of key openers returns in under 2 s with `totalBytes` = uncut size; a private key split by the 800 KiB hard cut is not returned; `boundForScrub` line-boundary cut and open-key drop; `--file` across two pages incl. rename, binary, not-found; 406 hint; files list across pages, totals, `--limit` truncation; `capUtf8` multi-byte boundary; `fileDiffSection` /dev/null headers |
| REQ-plugins-093 | `tests/store.scrub.test.ts`: scrub runs in linear time on hostile input (20,000 key openers per line or on one line, a key opener then 20,000 body lines, 50,000 `eyJ-`, a JWT head then 50,000 `eyJ-`), each under 1 s; keys and a JWT after a dash in diff-shaped text are still redacted |
| REQ-plugins-093 | `tests/plugins.list.smoke.test.ts`: `plugins list` shows `github-pr-diff` and `github-pr-files` |
| REQ-discord-066 | `tests/store.scrub.test.ts`: same linear-time and diff-shaped redaction tests, plus the existing vendor-shape, idempotence, write-path and re-scrub tests (unchanged) |

All fixtures use a real `Octokit` over a mocked `fetch` — no network, no token.
Both timing tests fail on the old quadratic patterns (7.5 s and 13.3 s).

## Requirement evidence

| Requirement | Test | Evidence |
|-------------|------|----------|
| REQ-plugins-093 | `tests/github.review.plugin.test.ts` | Gate, argv, diff cap + marker, hard cut before the scrub, open-key drop, scrub before cap, `--file`, 406 hint, files pagination/limit |
| REQ-plugins-093 | `tests/store.scrub.test.ts` | Linear-time scrub on hostile input; diff-shaped keys and JWTs still redacted |
| REQ-plugins-093 | `tests/plugins.list.smoke.test.ts` | `plugins list` shows both commands |
| REQ-discord-066 | `tests/store.scrub.test.ts` | Linear-time scrub on hostile input; every vendor shape still redacted; write paths and re-scrub unchanged |

Commands: `bun test tests/github.review.plugin.test.ts tests/store.scrub.test.ts`,
`bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.
