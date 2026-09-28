---
module: cli
change: local-spec-check-runs-at-the-ci-spec-sync-strictness-specsync-check-require-coverage-100-specsync-check-falls-back-to
---

# Delta — cli (specsync score)

## Added

### REQUIREMENT REQ-cli-089

`corvidinho specsync <list|read|check|brief|coverage|score|change-list|ship-status>` SHALL run the matching `specsync-*` plugin command. `score` SHALL run `specsync-score`, so "are we drifting?" can be answered from the CLI with SpecSync's own score report (SPECSYNC-3). No slash command is added.

Acceptance Criteria
- `corvidinho specsync score cli --explain` runs the local `specsync score cli --explain` and prints its report, exit 0.
- `corvidinho plugins run specsync-score --json -- --format json` returns `{ok:true,data:{output}}` with the report.
- A failing `specsync score` (e.g. `--min-score 90` below the floor) exits with its code and prints the report on stderr.
- `corvidinho specsync` with no or an unknown subcommand prints the usage line (which lists `score`) and exits 1; `--help` lists `score`.
