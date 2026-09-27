---
change: fledge-core-runs-wait-on-safe-3-like-the-shell-fledge-lanes-run-and-fledge-run-are-never-offered-to-the-model-from-the
artifact: research
---

# Research

- `src/agent/tools.ts` on main: `allowlistOffers(allowlist, name)` is
  `allowlist.has(name) && !SAFE3_PENDING_TOOLS.has(name)`, and
  `buildOpenAiTools` uses it for every dangerous plugin. So adding a name to
  the set is enough to keep it out of every task-run catalog (local CLI,
  Discord, `/session start`, `/work`, schedules, WATCH, delegate workers).
- `runPlugin` (the `corvidinho plugins run` path) checks the SAFE-1
  allowlist itself and never reads `SAFE3_PENDING_TOOLS`, so an operator
  can still run both commands. `tests/fledge.core.test.ts` ("SAFE-1 deny,
  and an allowlisted run") keeps passing.
- `plugins/fledge/core.ts`: `fledge-lanes-run` and `fledge-run` are
  `dangerous: true`, minTier 2. Their origin is not `fledge:`, so before
  this change `editsFilesUnreported` did not name them.
- `allowsFledge` in `src/agent/execute.ts` matched any
  `fledge-`-prefixed name that the allowlist offers. That included the two
  core reads, which are not dangerous, so the allowlist always "offers" them.
