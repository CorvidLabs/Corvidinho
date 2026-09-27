---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: docs
---

# Docs

- `README.md` (SpecSync section): run `fledge run spec-check` locally; it is
  `specsync check --require-coverage 100`, the CI strictness, and a verify
  lane step; `corvidinho specsync coverage` / `score` print the reports.
- `STATUS.md` SpecSync row: lists the coverage/score/change tools and the CI
  strictness of the local `spec-check`.
- `src/cli.ts` help line lists `score`.
- Specs: `specs/agent/agent.spec.md` invariant + error row for the
  CI-strict `spec-check`; `specs/plugins/plugins.spec.md` Public API
  (`projectDefinesSpecCheckTask`, `runSpecCheck`), invariants, two
  scenarios, error rows, files list (`tests/specsync.check-parity.test.ts`);
  `specs/cli/cli.spec.md` invariant + error row for `specsync score`.
- No CHANGELOG version section and no package bump (release PRs collect
  those).
