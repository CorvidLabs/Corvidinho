---
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
artifact: research
---

# Research

- specsync 6.0.0: `check`, `coverage` and `score` all accept
  `--strict` and `--require-coverage <N>`. `specsync score [SPEC]...`
  takes module filters, `--explain`, `--min-score <N>` (non-zero exit below
  it), `--all`, `--format text|json|markdown|github|table|csv`, and the
  global `--root`; it writes nothing. On main it printed
  `5 specs scored: average 79.4/100 [C]`.
- specsync has no config key or env var for the coverage floor:
  `require_coverage = 100` in `.specsync/config.toml` and
  `SPECSYNC_REQUIRE_COVERAGE=100` both leave the orphan repro at exit 0.
- fledge 1.8.0: `fledge run <task>` reads only `./fledge.toml` (a subdir of
  a project prints `no fledge.toml found`). With a `fledge.toml` lacking the
  task: `error: Unknown task 'spec-check'. Available tasks: …`, exit 1.
  Without one: `Could not detect project type and no fledge.toml found.`,
  exit 1.
- `Bun.which` caches PATH at process start (mutating `process.env.PATH`
  in-process does not change it), so the tests spawn the real CLI with a stub
  `fledge` / `specsync` directory first on PATH, as
  `tests/cli.doctor-truth.test.ts` does. CI (`ci.yml`) installs neither
  binary; Bun 1.4.2 there has `Bun.YAML` and `Bun.TOML`.
- The Spec Sync Action's `action.yml` is not reachable from this session, so
  the input → flag mapping is inferred from the CLI flag names.
