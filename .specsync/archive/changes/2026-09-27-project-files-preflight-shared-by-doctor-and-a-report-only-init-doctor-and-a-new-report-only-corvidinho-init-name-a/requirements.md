---
change: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
artifact: requirements
---

# Requirements

- Added REQ-cli-430: doctor and a report-only `corvidinho init` share one
  project-files preflight for the current dir — `fledge.toml`, a verify lane
  that runs spec-check, `.specsync/`, `specs/` — naming each missing item in
  plain language (CLI-4).

See `deltas/cli.md`.
