---
id: global-project-path-flag-runs-the-cli-as-if-started-in-that-directory-that-project-s-fledge-toml-specs-and-env-files-as
state: approved
type: feature
base_commit: 1c7b6ced470e0ed87e4c854f2663111713af3fa7
---

# Global --project <path> flag runs the CLI as if started in that directory: that project's fledge.toml, specs and .env files as Bun loads them there, never the start directory's (CLI-5)

## Intent

Global --project <path> flag runs the CLI as if started in that directory: that project's fledge.toml, specs and .env files as Bun loads them there, never the start directory's (CLI-5)

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- From another directory, corvidinho --project <path> (before or after the command, before --) makes task run read <path>/fledge.toml and <path>/specs, and loads <path>'s .env files exactly as a process started in <path> gets them (doctor output identical to running there; .env.local and $VAR expansion as Bun; set variables win; the start directory's .env values do not carry over); a missing, non-directory or empty --project prints one corvidinho: line plus hint and exits 1 before any command runs; tests/cli.project-path.test.ts covers these and fails on main

## No-spec Rationale

Not applicable
