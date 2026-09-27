---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: tasks
---

# Tasks

- [x] Reproduce the gap on `origin/main` (orphan file passes local
      spec-check, fails `--require-coverage 100`; no `specsync score` tool
      or CLI subcommand; `Unknown task 'spec-check'` without the Fledge task).
- [x] `fledge.toml` spec-check runs `specsync check --require-coverage 100`.
- [x] `projectDefinesSpecCheckTask` + `runSpecCheck` fallback to local
      `specsync check` (fail closed on an unparsable `fledge.toml`).
- [x] `specsync-score` plugin (tier 0, not dangerous, refuses `--root`) and
      `corvidinho specsync score`.
- [x] Tests: `tests/specsync.check-parity.test.ts`; extend
      `tests/specsync.plugins.test.ts` and
      `tests/specsync.path-containment.test.ts`; prove they fail on main.
- [x] Deltas (REQ-agent-005, REQ-plugins-008 modified; REQ-cli-089 added) and
      spec / README / STATUS updates.
- [x] Run change approve / check / audit, coverage check, tsc, bun test and the
      verify lane.
