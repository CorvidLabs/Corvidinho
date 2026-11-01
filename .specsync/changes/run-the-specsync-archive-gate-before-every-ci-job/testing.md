---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: testing
---

# Testing

- Both edited workflows parse with Ruby Psych (`Psych.safe_load`); the job
  graph is `archive-gate` with no needs, then `smoke` (ci.yml) and
  `spec-sync` (spec-sync.yml) each with `needs: archive-gate`.
- `bash .github/scripts/archive-readiness.sh .` from spec-sync at the pinned
  commit passes on the archived tip (no open change under
  `.specsync/changes/`).
- `specsync change audit --strict` and
  `specsync check --require-coverage 100` (specsync 6.0.0, the version CI
  pins).
- `bun test` (including `tests/specsync.check-parity.test.ts`) could not be
  run in the rollout environment; CI's `smoke` job runs it on the pull
  request.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| Archive runs first and every other job needs it | Psych parse of `ci.yml` and `spec-sync.yml` | `archive-gate` (name `Archive`) has no needs; `smoke` and `spec-sync` need it. |
| The gate fails while a change is open | `archive-readiness.sh` | Passes on the archived tip with `.specsync/changes/` empty. |
| Verify-lane parity still holds | `tests/specsync.check-parity.test.ts` | Ignores only the `archive-gate-only` step; runs in CI. |
