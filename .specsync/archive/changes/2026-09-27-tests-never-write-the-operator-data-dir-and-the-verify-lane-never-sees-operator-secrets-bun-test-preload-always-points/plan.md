---
change: tests-never-write-the-operator-data-dir-and-the-verify-lane-never-sees-operator-secrets-bun-test-preload-always-points
artifact: plan
---

# Plan

1. Reproduce on main: `CORVIDINHO_DATA_DIR=$T bun test` and count
   `audit_log` rows in `$T`.
2. Add regression tests first and prove they fail on main:
   `tests/preload.operator-data-dir.test.ts` (+ probe
   `tests/fixtures/preload-probe.ts`) and `tests/agent.verify-env.test.ts`.
3. Fix `tests/preload.ts` and `src/agent/verify.ts`; tests pass.
4. Re-run the full suite with the operator vars set; the operator dir must
   stay empty.
5. Spec deltas (REQ-cli-262 added, REQ-agent-002 modified), spec files lists,
   SpecSync checks, tsc, bun test, fledge verify lane.
