---
id: project-files-preflight-shared-by-doctor-and-a-report-only-init-doctor-and-a-new-report-only-corvidinho-init-name-a
state: implementing
type: feature
base_commit: b89018f12d3fa6607edfd1acce69186267038302
---

# Project-files preflight shared by doctor and a report-only init: doctor and a new report-only corvidinho init name a missing fledge.toml, verify lane with spec-check, .specsync/ and specs/ in plain language before task run fails on them mid-task (CLI-4)

## Intent

Project-files preflight shared by doctor and a report-only init: doctor and a new report-only corvidinho init name a missing fledge.toml, verify lane with spec-check, .specsync/ and specs/ in plain language before task run fails on them mid-task (CLI-4)

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- corvidinho doctor and a new report-only corvidinho init check the current dir's project files through one shared projectFilesDoctorChecks: fledge.toml (present, valid TOML), verify-lane ([lanes.verify] in fledge.toml or a .fledge/lanes/*.toml import runs spec-check: the defined spec-check task, a { task } / { run } / parallel step, or a task deps chain that runs specsync check), .specsync/ and specs/; each missing item prints one [missing] line in plain language naming what fails without it and, where Fledge / SpecSync has one, the command that creates it (fledge run --init, specsync init, specsync generate), and doctor / init exit 1; a complete project prints [ok] per item and doctor still passes in this checkout; init also prints the llm (warn without a key, never fails), fledge and specsync lines, creates and changes nothing, exits 0 when nothing is missing, and leaves Discord / GitHub keys and allowlists to doctor; file contents and parser messages are never printed (SAFE-6); no new flag, env var, config key, slash command, schema or package version change; regression tests fail on main and pass on the branch

## No-spec Rationale

Not applicable
