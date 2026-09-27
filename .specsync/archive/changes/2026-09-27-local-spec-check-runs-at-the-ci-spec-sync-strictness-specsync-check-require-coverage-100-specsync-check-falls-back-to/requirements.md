---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: requirements
---

# Requirements

- SPECSYNC-2 (captured, `hi/specsync.md`): the local check runs at the CI
  strictness and its failures block done. Modify **REQ-agent-005** (delta
  `deltas/agent.md`): the `spec-check` task carries the CI Spec Sync
  Action strictness (`--require-coverage` equal to `require-coverage` in
  `spec-sync.yml`; `--strict` only when the Action sets `strict`), and an
  unspecced source file fails the verify lane.
- SPECSYNC-2 / SPECSYNC-7: `specsync-check` uses the project's Fledge
  `spec-check` task only when the project defines it, else the local
  `specsync check`. SPECSYNC-3: a read-only `specsync-score` tool. Modify
  **REQ-plugins-008** (delta `deltas/plugins.md`).
- SPECSYNC-3: `corvidinho specsync score` maps to `specsync-score`. Add
  **REQ-cli-089** (delta `deltas/cli.md`; id after issue #89, unused in
  `specs/*/requirements.md`).
- SPECSYNC-6: `specsync-score` uses the local binary only, no API key.
- No new slash command, env var, config key, schema version or package
  version.
