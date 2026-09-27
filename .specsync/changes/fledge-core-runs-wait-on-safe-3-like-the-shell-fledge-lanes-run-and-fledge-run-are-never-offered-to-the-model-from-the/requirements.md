---
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
artifact: requirements
---

# Requirements

- Captured HI: PLUGIN-1 and PLUGIN-2 (`hi/plugin.md`), SAFE-1
  (`hi/safe.md`), CLI-3. SAFE-3 is Leif's open decision; this change only
  applies #261's existing hold-out rule to two more tools of the same kind. It
  adds no criterion.
- REQ-agent-501 (modified, `deltas/agent.md`): `SAFE3_PENDING_TOOLS` gains
  `fledge-lanes-run` and `fledge-run`; they are never offered from the
  allowlist until the SAFE-3 decision and still run through
  `corvidinho plugins run`.
- REQ-agent-112 (modified): Fledge plugin discovery starts only for an
  allowlisted Fledge *plugin* command; naming one of the four core builtins
  starts none.
- REQ-agent-502 is unchanged in text: `editsFilesUnreported` already covers
  every `SAFE3_PENDING_TOOLS` name, so it now names the two core runs.
- No env var, config key, flag, slash command, schema or package version.
