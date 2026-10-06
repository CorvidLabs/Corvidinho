---
change: doctor-and-init-say-when-the-verify-lane-runs-no-test-step-corvidinho-can-read-cli-4-one-warn-test-step-line-when-no
artifact: docs
---

# Docs

- README.md (Requirements): no longer says doctor does not check the test
  step; says doctor prints `[warn] test-step` when no verify-lane step
  visibly runs a recognised runner, and why it does not fail doctor.
- specs/cli/cli.spec.md: Public API row for `projectFilesDoctorChecks`,
  the doctor / init behaviour paragraph, a new scenario and an error-case
  row; specs/cli/testing.md: REQ-cli-430 inventory line.
- docs/BOX-UPDATE.md is unchanged: it lists the checks that can fail an
  update, and `[warn]` lines never do.
