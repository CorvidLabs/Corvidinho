---
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
artifact: docs
---

# Docs

`docs/DISCORD-GO-LIVE.md`:

- The `fledge-lanes-run` / `fledge-run` row in the dangerous-tools table now
  ends "never offered to the model from the allowlist until the SAFE-3
  decision", like the `shell-exec` and runner rows.
- The "Never from the allowlist" bullet names the two core runs.
- The Fledge discovery bullet says naming a core builtin starts no discovery.
- The dangerous-tools intro names the two core runs next to the shell and
  the runners.

`specs/agent/agent.spec.md`: the `SAFE3_PENDING_TOOLS` export list, the
discovery rule, the `delegate` unreported-edit rule, the allowlist invariant
and the error-case rows.
