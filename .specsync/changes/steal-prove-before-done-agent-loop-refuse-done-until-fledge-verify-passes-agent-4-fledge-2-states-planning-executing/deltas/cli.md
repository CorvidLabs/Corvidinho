---
module: cli
change: steal-prove-before-done-agent-loop-refuse-done-until-fledge-verify-passes-agent-4-fledge-2-states-planning-executing
---

# Delta — cli (task run / --no-verify)

## Added

### REQUIREMENT REQ-cli-005

The CLI SHALL expose `task run` with `--no-verify`, optional `--max-retries`, and `--json` TaskResult output so operators and bridges can exercise or skip the prove-before-done gate.

Acceptance Criteria
- `corvidinho task run --no-verify --json` exits 0 with verify_skipped.
- Help documents `task run` and `--no-verify`.

## Modified

### SPEC SECTION Purpose

Operator surface includes task run for prove-before-done gate.

### SPEC SECTION Invariants

task run honors --no-verify and agent config; bridges may skip verify for latency.
plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.

### SPEC SECTION Change Log

task run + --no-verify prove-before-done surface (2026-09-26, corvid-agent).
plugins list/run + non-interactive + doctor plugin count (2026-09-26, corvid-agent).

### SPEC SECTION Dependencies

Consumes plugins module for loadBuiltins/list/size/runPlugin/helpers.
Consumes agent module for runTask / loadAgentConfig.
