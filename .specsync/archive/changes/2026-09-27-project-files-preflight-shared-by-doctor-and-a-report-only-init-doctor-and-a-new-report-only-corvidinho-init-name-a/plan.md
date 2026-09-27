---
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
artifact: plan
---

# Plan

1. `src/doctor.ts`: `projectFilesDoctorChecks(cwd)` with the fledge.toml /
   imported-lane loader, verify-lane spec-check detection and the two
   directory checks.
2. `src/cli.ts`: shared `toolOnPathCheck` and `printChecks`; doctor adds the
   project-file lines after `specsync`; new report-only `init` command and
   help lines.
3. tests/cli.doctor-truth.test.ts: CLI regression tests in fixture project
   dirs (empty, complete, lane variants, broken TOML, PATH without tools).
4. README.md, docs/BOX-UPDATE.md, tests/docs.operator-facts.test.ts.
5. SpecSync delta (Added REQ-cli-430), spec prose, verify lane.
