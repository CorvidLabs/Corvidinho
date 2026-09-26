---
change: github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200
artifact: plan
---

# Plan

1. Add `plugins/github/review.ts` (`github-pr-diff`, `github-pr-files`, cap +
   scrub + untrusted label, injectable Octokit factory for tests).
2. Register from `plugins/github/index.ts`; leave `commands.ts` untouched.
3. Tests `tests/github.review.plugin.test.ts` with a real Octokit over a mocked
   fetch; add both names to `tests/plugins.list.smoke.test.ts`.
4. Spec: `deltas/plugins.md` adds REQ-plugins-093; list new files in
   `specs/plugins/plugins.spec.md` `files:`.
5. Docs: `docs/WATCH.md` GitHub plugin paragraph.
6. `specsync change approve` → `change check --commit` → audit, coverage 100,
   tsc, bun test, `fledge lanes run verify --non-interactive`.
