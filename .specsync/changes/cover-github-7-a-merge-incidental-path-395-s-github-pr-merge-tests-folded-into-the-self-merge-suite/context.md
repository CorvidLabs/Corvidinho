---
change: cover-github-7-a-merge-incidental-path-395-s-github-pr-merge-tests-folded-into-the-self-merge-suite
artifact: context
---

# Context

PR #394 (GITHUB-7.a self-merge gate) merged origin/main after #395 had landed
its own, weaker `github-pr-merge` (`mergeOwnGreenPr` in
`plugins/github/merge.ts`, tested by `tests/github.merge.plugin.test.ts`).
The merge keeps exactly one tool, #394's GITHUB-7.a gate, so `mergeOwnGreenPr`
and its exports are gone and #395's test file no longer loads.

Its 12 cases move into `tests/github.self-merge.test.ts` (block "GITHUB-7
cases carried over from #395"): the ones that still hold under GITHUB-7.a as
they were, the ones whose PR the stricter gate now refuses on GITHUB-7.a
fixtures. Deleting `tests/github.merge.plugin.test.ts` is a meaningful path
that the main change (`it-can-merge-its-own-corvidinho-pr-…-github-7`, already
approved and verifying) does not list, so this change covers it with
`--no-spec-change`: REQ-plugins-099 (modified by the main change) and
`specs/plugins/testing.md` already describe where the cases went.

#395's own SpecSync changes are not touched.
