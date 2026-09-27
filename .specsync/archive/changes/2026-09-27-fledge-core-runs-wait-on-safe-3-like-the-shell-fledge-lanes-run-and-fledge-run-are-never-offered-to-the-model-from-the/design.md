---
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
artifact: design
---

# Design

- `SAFE3_PENDING_TOOLS` gets `fledge-lanes-run` and `fledge-run`. The doc
  comment says why: each starts in the project dir, which is not a clamp, and
  runs whatever commands the project gives it. `includeDangerous` (the test
  seam) still offers them, as it does the shell.
- `allowsFledge` skips the four `FLEDGE_CORE_COMMAND_NAMES` (imported from
  `plugins/fledge/core.ts`), so discovery only starts for an allowlisted
  Fledge plugin command. `workerEditsUnreported` uses the same helper, so a
  local run that allowlists only core builtins no longer flags every
  `delegate` as an unreported edit.
- Alternative not taken: leave the core runs offerable and rely on the SAFE-1
  allowlist alone. That would let an allowlist offer the model a
  shell-equivalent while `shell-exec` itself waits on SAFE-3, so it is not
  consistent with #261. When Leif decides SAFE-3, the set is the one place to
  change.
