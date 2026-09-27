---
id: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
state: implementing
type: feature
base_commit: 0940db343de30fdb4d79d83cfa44b95c5a247681
---

# PLUGIN-1 Fledge itself as typed builtins: fledge-lanes-list and fledge-lanes-validate (read-only) and fledge-lanes-run and fledge-run (dangerous, code tier) wrap the local fledge CLI in the project root

## Intent

PLUGIN-1 Fledge itself as typed builtins: fledge-lanes-list and fledge-lanes-validate (read-only) and fledge-lanes-run and fledge-run (dangerous, code tier) wrap the local fledge CLI in the project root

## Affected Canonical Specs

- `plugins`
- `agent`

## Acceptance Criteria

- PLUGIN-1 (Fledge itself as plugins with typed commands): after builtin load, plugins list and the tool catalog carry fledge-lanes-list and fledge-lanes-validate (dangerous=false, minTier 0: offered at tool and code tier, also to non-ADMIN role sessions) and fledge-lanes-run and fledge-run (dangerous=true, minTier 2: SAFE-1 non-interactive deny unless allowlisted, audited, offered only at code tier with dangerous tools to ADMIN); each runs the local fledge CLI with an argv array (no shell) in the plugin cwd: fledge --non-interactive lanes list --json / lanes validate --json [--strict] / lanes run <lane> / run <task> [-- args verbatim]; lists and validation come back typed (lanes with name, steps, description; lane count, errors, warnings), an invalid fledge.toml is ok=false with fledge's errors, a failing lane or task is ok=false with fledge's exit code and output; a lane or task name must be a plain name (no leading dash) and validate takes no path, so model argv never becomes a fledge option, else a usage error that spawns nothing; fledge is resolved on absolute PATH entries only and missing is exit 127; the child gets the verify lane's scrubbed env without CDPATH/OLDPWD, stdin closed, a timeout (124), output caps, process-tree kill on the calling run's abort (130), and secret-scrubbed output; a Fledge plugin command named run, lanes-list, lanes-validate or lanes-run is skipped (plugins list says why) and the builtin keeps the name; no new slash command, env var, config key, schema or package version; regression tests fail on main and pass on the branch

## No-spec Rationale

Not applicable
