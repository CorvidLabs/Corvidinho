---
module: agent
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
---

# Delta — agent (spec-check at CI Spec Sync strictness)

## Modified

### REQUIREMENT REQ-agent-005

Prove-before-done verify lane SHALL include SpecSync check (`spec-check` on `lanes.verify`) so SpecSync check failures block `verified=true` (SPECSYNC-2/7). CI Spec Sync Action remains a separate workflow.

The `spec-check` task SHALL run `specsync check` at the CI Spec Sync Action's strictness: `--require-coverage` equal to the Action's `require-coverage` input in `.github/workflows/spec-sync.yml`, and `--strict` only when the Action sets `strict`. A tree the CI Spec Sync check rejects SHALL NOT reach `verified=true` locally (SPECSYNC-2).

Acceptance Criteria
- `fledge.toml` `[lanes.verify]` steps include `spec-check`.
- Default verify runner argv stays `lanes run verify --non-interactive` (spec-check runs inside the lane).
- `fledge.toml` `[tasks.spec-check]` is `specsync check --require-coverage 100` while `spec-sync.yml` sets `require-coverage: "100"` and `strict: false`; a test fails when the two disagree (coverage value, `--strict` present iff `strict` is true, or an Action input the check does not know).
- A source file under a SpecSync source dir with no spec coverage makes `fledge run spec-check` (and so the verify lane) exit non-zero, naming the file.
