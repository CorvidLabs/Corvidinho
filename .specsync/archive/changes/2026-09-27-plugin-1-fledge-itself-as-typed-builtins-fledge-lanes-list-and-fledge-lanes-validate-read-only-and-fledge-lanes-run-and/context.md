---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: context
---

# Context

HI: PLUGIN-1 (hi/plugin.md) — "Files, search, shell, git, github, web,
memory, SpecSync, and Fledge itself are available as plugins with typed
commands." Open issue that tracks PLUGIN-1: #83 (its shell part shipped in
#140); this change is the "Fledge itself" part.

Gap on main (0940db3): `loadBuiltins()` registers 47 commands and none is
Fledge's own. `plugins/fledge/{commands,discover,index,spawn}.ts` only bridge
the project's Fledge *plugins* (`fledge plugins list` → `fledge-<command>`,
PLUGIN-3 / REQ-plugins-112..113). Fledge's own commands (`lanes list`,
`lanes validate`, `lanes run`, `run <task>`) are reachable only through
`shell-exec` (dangerous, untyped) or inside the verify gate
(src/agent/verify.ts runs `fledge lanes run verify --non-interactive`).
Repro: `bun -e 'import {loadBuiltins} from "./src/plugins/builtins.ts"; import
{list} from "./src/plugins/registry.ts"; loadBuiltins(); console.log(list().length,
list().filter(e=>/lanes|^fledge-run$/.test(e.name)))'` → `47 []`.

Constraints: no new slash command, env var or config key; no SQLite schema or
package version change; no ACCESS / bounty / MainNet surface. Open PRs #232
and #233 (ask-button gate, SAFE-3 clamp) are another worker's and are not
touched. `task run` still offers no dangerous tool to the model (that is a
separate slice), so the two run commands are reachable through
`corvidinho plugins run` (and any catalog built with dangerous tools) until
then; the two read commands are offered at tool and code tier today.
