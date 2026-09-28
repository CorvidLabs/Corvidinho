---
module: cli
change: plugins-run-passes-every-argv-item-after-the-that-follows-the-plugin-name-to-the-plugin-verbatim-so-global-flags-json
---

# Delta — cli (plugins run args after `--` reach the plugin verbatim)

## Added

### REQUIREMENT REQ-cli-186

`corvidinho plugins run <name> [--json] [-- ...args]` SHALL pass every argv
item after the first `--` that follows the plugin name to the plugin
verbatim. Items there that look like Corvidinho flags (`--json`,
`--no-verify`, `--non-interactive`, `--task`, `--tier`,
`--max-retries`, `--help`, `-h`, another `--`) SHALL NOT be parsed as
CLI flags. Global flags and `--json` before that `--` SHALL keep working.
Help SHALL be read only from Corvidinho's own argv, never from those plugin
args or from the `--task` value (REQ-cli-143).

Acceptance Criteria
- `plugins run search-grep --json -- --no-verify src` gives the plugin `--no-verify src` and prints JSON.
- `plugins run shell-exec -- gh pr list --json number` gives the plugin `gh pr list --json number`.
- `plugins run shell-exec -- ls -h` runs the plugin instead of printing help.
- `--non-interactive plugins run fledge-hello -- a` still runs non-interactive; `--help` before the `--` still prints help.
- `task run --task -h` runs the task with `-h` as its text.
