---
id: call-registered-fledge-plugins-as-tools-issue-112-fledge-4-5-plugin-2-3-6-discover-the-project-s-fledge-plugins-via-the
state: archived
type: feature
base_commit: 8747a9abb99c2322ea67c40da96fb60bc69172bc
---

# Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list

## Intent

Call registered Fledge plugins as tools (issue #112, FLEDGE-4/5 PLUGIN-2/3/6): discover the project's Fledge plugins via the fledge CLI, register each command as a dangerous typed plugin run through fledge plugins run with argv arrays, and show per-command tool schema cost plus a context budget line in plugins list

## Affected Canonical Specs

- `plugins`
- `cli`
- `agent`

## Acceptance Criteria

- corvidinho discovers the project's installed Fledge plugins by running fledge plugins list/audit --json with cwd set to the project root, argv arrays and a timeout; each Fledge plugin command registers as typed plugin fledge-<command> with dangerous true and minTier 2 (native) or 1 (sandboxed wasm without exec); plugins run fledge-<command> executes fledge --non-interactive plugins run <command> <argv...> in the project root with no shell, stdin closed, a scrubbed env, capped and secret-scrubbed output and a timeout; SAFE-1 denies them in non-interactive mode unless allowlisted; missing fledge, non-zero exit, bad JSON or timeout during discovery degrade to zero Fledge commands with a reason and never break builtins; plugins list shows each command's origin and approximate tool-schema tokens plus a total against a tool-surface budget with over-budget and oversized-schema warnings, and plugins list --json stays an array with origin/schemaChars/approxTokens per entry; fixture tests use a fake fledge on PATH with no network

## No-spec Rationale

Not applicable
