---
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
artifact: plan
---

# Plan

1. `src/doctor.ts`: share the task `cmd` / `deps` walk as
   `taskChainSome`; add `runsTestRunner` (patterns from
   `TEST_SUMMARY_RUNNERS`) and `verifyTestStepCheck`; add its line to
   `projectFilesDoctorChecks` after `verify-lane`.
2. tests/cli.doctor-truth.test.ts: the warn line in doctor and init (decoy
   wrappers, exit 0, nothing created or printed), no line for the runner
   shapes, the verify-lane `[missing]` line alone when absent / broken.
3. README.md, specs/cli prose and testing inventory.
4. SpecSync delta (Modified REQ-cli-430), `specsync check`, verify lane.
