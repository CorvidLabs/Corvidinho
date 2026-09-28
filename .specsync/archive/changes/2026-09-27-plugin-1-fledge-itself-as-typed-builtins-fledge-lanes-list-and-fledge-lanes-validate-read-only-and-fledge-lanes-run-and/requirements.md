---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: requirements
---

# Requirements

HI: PLUGIN-1 ("Fledge itself [is] available as plugins with typed
commands"), with PLUGIN-2 (danger and tier declared and enforced), SAFE-1
(dangerous denied non-interactively unless allowlisted), SAFE-2 (`fledge.toml`
is protected infra; `fledge run --init` would write it), SAFE-6 (scrubbed
child env and output).

- REQ-plugins-461 (added): the four Fledge core builtins, their danger and
  tier, argv shape, name checks, typed list / validate results, run results,
  child env, limits, fledge resolution and the name collision with Fledge
  plugin commands.
- REQ-agent-112 (modified): the default catalog offers no Fledge plugin
  command, but it now carries the two read-only Fledge core builtins, which
  spawn fledge only when called. The old bullet "no `fledge-*` tool is
  offered" is narrowed to Fledge plugin commands; a new bullet covers the
  core reads and no fledge spawn while building the catalog.

Unchanged: REQ-plugins-112 (a name already registered by a builtin is
skipped with a reason — now also hit by `run` / `lanes-*` plugin commands),
REQ-plugins-113 (Fledge plugin runs), REQ-agent-002 (verify lane runner).
