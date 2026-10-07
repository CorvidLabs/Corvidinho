---
change: cover-github-7-a-merge-incidental-path-395-s-github-pr-merge-tests-folded-into-the-self-merge-suite
artifact: plan
---

# Plan

1. Fold each #395 case into `tests/github.self-merge.test.ts` against
   `checkSelfMerge` / `makeGithubPrMergeCommand` (fake client, no token).
2. Delete `tests/github.merge.plugin.test.ts`; drop it from
   `specs/plugins/plugins.spec.md` `files` (done by the main change).
3. Cover the deleted path with this change; approve, check, and keep
   `specsync change audit` green.
