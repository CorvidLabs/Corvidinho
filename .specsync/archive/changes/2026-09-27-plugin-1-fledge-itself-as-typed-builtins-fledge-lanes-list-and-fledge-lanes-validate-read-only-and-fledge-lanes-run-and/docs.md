---
change: plugin-1-fledge-itself-as-typed-builtins-fledge-lanes-list-and-fledge-lanes-validate-read-only-and-fledge-lanes-run-and
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md` E.3: a `fledge-lanes-run` / `fledge-run` row in
  the dangerous-tools table (the table is "printed from the registry" and
  would otherwise miss them); the `fledge-<command>` row says a Fledge plugin
  command named `run` / `lanes-list` / `lanes-validate` / `lanes-run` is
  skipped because the core builtins hold those names. E.6: non-ADMIN sessions
  keep `fledge-lanes-list` / `-validate` among their read tools.
- `specs/plugins/plugins.spec.md`: `plugins/fledge/core.ts` and
  `tests/fledge.core.test.ts` in `files:`; purpose, public API, an
  invariants paragraph, a scenario, error rows and a dependency row.
- `specs/plugins/testing.md` / `tasks.md`: the Fledge core builtins.
- Deltas: plugins Added REQ-plugins-461; agent Modified REQ-agent-112.
- No README, STATUS, CHANGELOG or package version change: no flag, env var,
  config key or slash command is added, and no other doc lists the builtins.
