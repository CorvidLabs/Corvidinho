---
id: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
state: archived
type: bug_fix
base_commit: 544fe131ad199fa46e0ff7ea573b83a920db0bbf
---

# Plugins run passes every argv item after the -- that follows the plugin name to the plugin verbatim, so global flags, --json and -h there are never taken by the Corvidinho CLI

## Intent

Plugins run passes every argv item after the -- that follows the plugin name to the plugin verbatim, so global flags, --json and -h there are never taken by the Corvidinho CLI

## Affected Canonical Specs

- `cli`

## Acceptance Criteria

- Every argv item after the first -- that follows plugins run <name> reaches the plugin verbatim, including --json, --no-verify, --non-interactive, --task, --tier, --max-retries, --help, -h and a second --; global flags and --json before that -- still apply; --help before it still prints help; task run --task -h runs the task instead of printing help; fixture tests fail before the fix and pass after

## No-spec Rationale

Not applicable
