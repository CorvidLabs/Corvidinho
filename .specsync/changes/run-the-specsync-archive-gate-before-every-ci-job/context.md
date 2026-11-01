---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: context
---

# Context

This is part of the org-wide rollout of CorvidLabs/spec-sync#832, approved by
0xLeif. That PR added an archive gate to the spec-sync GitHub Action:
`archive-gate-only: 'true'` runs only `.github/scripts/archive-readiness.sh`
(bash + python3, no binary download) and fails while any change under
`.specsync/changes/` is still open. The problem it closes: a pull request
could merge with an SDD change still active, which strands the workspace and
orphans its verification.

Published `@v6.1.1` and older ignore the new input, so the step pins the
merge commit 106aaa43d0bcf049f19b173ddb63815a25c3f931 until a release carries
the gate. A job that is skipped because its `needs` failed counts as passing
for branch protection, so blocking the merge relies on an org ruleset that
requires a check named `Archive`; that ruleset is configured separately.

`release.yml` is left alone: it runs on pushes to main, tags and dispatch
only, never on a pull request, and main carries no open change after a merge.

`tests/specsync.check-parity.test.ts` expected exactly one
`CorvidLabs/spec-sync@` step in `spec-sync.yml`; it now leaves out the
`archive-gate-only` step, which runs no `specsync check` and so carries no
strictness for the verify lane to mirror.
