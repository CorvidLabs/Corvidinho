---
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
artifact: docs
---

# Docs

- `bun src/cli.ts --help`: `doctor` line names project files; new
  `corvidinho init` line (report only, creates nothing, CLI-4).
- README.md: Requirements names the project files doctor / init check;
  Quick start lists `bun src/cli.ts init`.
- docs/BOX-UPDATE.md: the doctor checks that must pass on an update include
  the checkout's `fledge.toml`, `verify-lane`, `.specsync` and `specs`
  (the checkout has all four); tests/docs.operator-facts.test.ts keeps that
  list in step with the code.
- specs/cli/cli.spec.md: Public API row, invariant, scenario and error cases;
  specs/cli/testing.md: test inventory line for REQ-cli-430.
