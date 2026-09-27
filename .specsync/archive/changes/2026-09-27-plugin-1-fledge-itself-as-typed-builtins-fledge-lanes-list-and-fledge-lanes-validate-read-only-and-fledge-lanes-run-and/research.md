---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: research
---

# Research

- fledge 1.8.0 (box): `lanes list --json` → `{schema_version:1, lanes:[{name,
  description|null, fail_fast, step_count, trust_tier}]}`, exit 0; with no
  `fledge.toml` it exits 1 with `No fledge.toml found`. `lanes validate
  --json [--strict] [PATH]` prints `{errors, warnings, lane_count, path}` on
  stdout and exits 1 (`error: Validation failed` on stderr) when a lane is
  invalid; PATH defaults to `.`. `lanes run <NAME>` also takes
  `--dry-run`, `--json`, `--from`. `run [TASK] [-- ARGS]` appends args after
  `--` to the task's command (or fills `$1`/`$@`), never splicing them
  into its string; `run` also has `--init` (writes `fledge.toml`),
  `--list`, `--lang`, `--stream`.
- `lanes run` / `run` have no confirmation prompt (fledge-1.8.0
  src/lanes, src/run.rs); `--non-interactive` only matters for lane import,
  which these commands never reach.
- fledge does not reserve plugin command names (src/plugin/validate.rs); its
  own subcommands win over a plugin command of the same name on its command
  line (clap `external_subcommand` only fires for unknown names), so a plugin
  command `run` is already unreachable as `fledge run`.
- `Bun.which(cmd, {PATH})` resolves a relative entry against the process
  cwd; only absolute entries are passed (as the runners do).
- `buildOpenAiTools` drops dangerous tools unless `includeDangerous`,
  mutating tools for non-ADMIN sessions and tools above the tier; minTier 0
  tools are offered at tool and code tier. `createTaskExecute` loads Fledge
  plugins only with `includeDangerous` (REQ-agent-112), so the default
  catalog has no Fledge plugin command; the new reads are builtins and appear
  there.
- The tool surface with every builtin offered grows from ~5449 to ~5871
  approx tokens (budget 8000, REQ-plugins-114).
