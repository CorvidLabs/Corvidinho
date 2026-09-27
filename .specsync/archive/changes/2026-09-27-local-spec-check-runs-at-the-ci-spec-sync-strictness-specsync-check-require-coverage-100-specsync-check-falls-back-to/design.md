---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: design
---

# Design

- `fledge.toml`: `[tasks.spec-check] cmd = "specsync check --require-coverage 100"`
  with a comment tying it to `spec-sync.yml`. `strict: false` in the Action
  means no `--strict`. The verify lane (`lint`, `smoke`, `test`,
  `spec-check`) and `defaultVerifyRunner` argv are unchanged, so a
  spec-check failure keeps today's retry → verified=false path.
- `plugins/specsync/api.ts`: new `projectDefinesSpecCheckTask(cwd)` reads
  `<cwd>/fledge.toml` (fledge itself only reads the cwd file; checked with
  fledge 1.8.0, no parent search) with `Bun.TOML.parse` and looks for
  `tasks["spec-check"]` (both `[tasks.spec-check]` and
  `[tasks] "spec-check" = …` forms). No file or no task → false. Read or
  parse error → true, which keeps today's Fledge path, so a broken
  `fledge.toml` fails loudly instead of quietly running a laxer check.
  `runSpecCheck` uses `fledge run spec-check` only when fledge is on PATH
  **and** that returns true; otherwise the local `specsync check` (the
  project's own `.specsync` config decides its rules; no CI flags guessed
  for other repos).
- `plugins/specsync/commands.ts`: new `specsync-score` next to
  `specsync-coverage`, same shape: `minTier: 0`, `dangerous: false`,
  `refuseRootArg` before spawning, `spawnSpecsync(cwd, ["score", ...args])`,
  non-zero exit passes through with the report as the error. `specsync score`
  has no write flags. The `specsync-check` description now says it uses the
  Fledge task only when defined.
- `src/cli.ts`: `score: "specsync-score"` in the `specsync` subcommand map;
  help and usage lines list `score`.
- Alternative rejected: asking fledge (`fledge run --list --json`) whether
  the task exists. It costs a second spawn on every check and would still need
  a fail-closed rule; the TOML read matches what `fledge run` reads.
- Alternative rejected: deriving the flags at runtime from
  `spec-sync.yml`. That makes the verify lane parse CI YAML; a parity test
  guards drift instead.
