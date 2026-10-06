---
change: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
artifact: testing
---

# Testing

`tests/github.merge.plugin.test.ts` (12 tests, fake Octokit, no network):
slug check; own green merge (squash, no admin); dry-run skips merge; refuse
outside Corvidinho / other author / CI red / draft|closed|not-mergeable;
merge API error surfaced; plugin SAFE-1 / listing / outside-repo / usage.

Fail-on-base: without `merge.ts` / command the new test file fails to load
or the listing assertion fails.
