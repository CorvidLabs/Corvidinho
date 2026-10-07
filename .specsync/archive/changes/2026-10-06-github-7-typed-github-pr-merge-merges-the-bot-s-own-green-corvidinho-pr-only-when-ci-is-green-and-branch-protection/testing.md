---
change: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
artifact: testing
---

# Testing

`tests/github.merge.plugin.test.ts` (12 tests, fake Octokit, no network,
no live tokens): `isCorvidinhoRepoSlug`; `mergeOwnGreenPr` merges own green
Corvidinho PR (squash, no admin field on `pulls.merge`), dry-run skips
`pulls.merge`, refuses outside Corvidinho, refuses other authors, refuses
non-green CI, refuses draft/closed/not-mergeable, surfaces merge API errors;
plugin listing is dangerous minTier 1, SAFE-1 denies without allowlist,
outside-Corvidinho refusal before Octokit, usage error without a PR number.
`tests/plugins.list.smoke.test.ts` expects `github-pr-merge` in
`plugins list`.

Fail-on-base: without `plugins/github/merge.ts` / the command the new test
file fails to load, or the listing assertion fails.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-plugins-099` | `tests/github.merge.plugin.test.ts` mergeOwnGreenPr + plugin cases (12) | own green squash merge, no admin; dry-run skips merge; outside Corvidinho / other author / CI red / draft\|closed\|not-mergeable refuse exit 2; merge API error surfaced; SAFE-1 deny; plugins list names `github-pr-merge`. |
| all | full `bun test`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
