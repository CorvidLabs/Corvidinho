---
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
artifact: tasks
---

# Tasks

- [x] Reproduce on main (b89018f): doctor in an empty dir prints no project-file line; `corvidinho init` prints `Unknown command: init`.
- [x] `projectFilesDoctorChecks` in src/doctor.ts (fledge.toml, verify-lane, .specsync, specs).
- [x] doctor prints the project-file lines; new report-only `init` (llm, fledge, specsync, project files); help lines.
- [x] Regression tests in tests/cli.doctor-truth.test.ts fail with main's src/cli.ts and src/doctor.ts swapped in and pass on the branch.
- [x] README.md, docs/BOX-UPDATE.md and tests/docs.operator-facts.test.ts updated.
- [x] Delta (cli, Added REQ-cli-430), spec prose (Public API, Invariants, Behavioral Examples, Error Cases), testing.md.
- [x] Full suite, typecheck, SpecSync and the verify lane green.
