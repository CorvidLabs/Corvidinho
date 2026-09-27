---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: plan
---

# Plan

1. Reproduce on a copy of `origin/main`: orphan `src/zzz/orphan.ts` passes
   `specsync check` / `fledge run spec-check` but fails
   `specsync check --require-coverage 100`; `specsync score` is not
   reachable as a tool or CLI subcommand.
2. Add `tests/specsync.check-parity.test.ts` (CI-parity, fallback, Fledge
   path guard, score, catalog, optional real-binary block) and extend
   `tests/specsync.plugins.test.ts` / `tests/specsync.path-containment.test.ts`.
   Confirm the new cases fail on main.
3. Change `fledge.toml`, `plugins/specsync/api.ts`,
   `plugins/specsync/commands.ts`, `src/cli.ts`.
4. Deltas: modify REQ-agent-005 and REQ-plugins-008, add REQ-cli-089; update
   agent / plugins / cli spec invariants, scenarios, error rows and the
   plugins files list; README + STATUS SpecSync lines.
5. `specsync change approve`, `specsync change check --commit`,
   `specsync change audit`, `specsync check --require-coverage 100`,
   `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
