---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: tasks
---

# Tasks

- [x] Re-check the gap on current main (0940db3): 47 builtins, none for Fledge's own commands.
- [x] Regression tests in tests/fledge.core.test.ts; they fail on main (the file cannot load without core.ts; with core.ts but main's builtins.ts and index.ts, the registration, catalog, collision, default-catalog and real CLI tests fail).
- [x] `plugins/fledge/core.ts`: `fledgeCoreCommands`, `loadFledgeCorePlugins`, `resolveFledgeBin`, `fledgeCoreChildEnv`, `parseLanesList`, `parseLanesValidate`, `FLEDGE_NAME_RE`, `FLEDGE_CORE_COMMAND_NAMES`.
- [x] Re-export from `plugins/fledge/index.ts`; `loadBuiltins` registers the four commands.
- [x] `tests/fledge.plugins.test.ts`: the default-catalog assertion names the two core reads and still no Fledge plugin command.
- [x] Deltas (plugins Added REQ-plugins-461, agent Modified REQ-agent-112), spec prose and files, plugins testing and tasks companions.
- [x] `docs/DISCORD-GO-LIVE.md`: dangerous-tool table row, collision note on `fledge-<command>`, non-ADMIN read tools.
- [x] Review: lane-source clamp for the reads (`laneSourcesRefusal`): `fledge.toml` / `.fledge/lanes` / `.fledge/lanes/*.toml` linked outside the project or to a secret path are refused before fledge starts (real fledge echoes a line of a file it cannot parse); tests fail without it.
- [x] `specsync check --require-coverage 100`, `bunx tsc --noEmit`, `bun test` and `fledge lanes run verify --non-interactive` green.
