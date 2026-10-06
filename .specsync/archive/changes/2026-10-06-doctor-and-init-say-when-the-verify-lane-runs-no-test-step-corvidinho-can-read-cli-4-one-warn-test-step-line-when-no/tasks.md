---
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
artifact: tasks
---

# Tasks

- [x] Share the task `cmd` / `deps` walk (`taskChainSome`) in src/doctor.ts
- [x] Add `verifyTestStepCheck` with runner names from `TEST_SUMMARY_RUNNERS`
- [x] Print it from `projectFilesDoctorChecks` (doctor and init)
- [x] Regression tests in tests/cli.doctor-truth.test.ts (fail on base, pass on branch)
- [x] README.md: doctor no longer said to skip the test step
- [x] specs/cli: spec prose, scenario, error case, testing inventory; delta for REQ-cli-430
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`
