---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: plan
---

# Plan

1. Add `plugins/github/ciStatus.ts`: selector parse + ref validation, row
   mapping, bucket counts, verdict, paged fetch of check runs and combined
   commit statuses, one-line message.
2. Rewrite only the `github-ci-status` handler region in
   `plugins/github/commands.ts` to use it; keep `dangerous: false`,
   `minTier: 0`, `--repo` gate; description names PR-or-ref + verdict.
3. Add `tests/github.ci-status.test.ts` (mocked Octokit + stubbed transport,
   no network or real token).
4. Spec: delta `REQ-plugins-094` (Added); list the new files in
   `specs/plugins/plugins.spec.md`, bump its version, add a Change Log row.
5. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit`, `specsync check --require-coverage 100`,
   `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
