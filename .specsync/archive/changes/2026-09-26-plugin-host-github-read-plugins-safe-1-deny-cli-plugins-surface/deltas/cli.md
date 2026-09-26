---
module: cli
change: plugin-host-github-read-plugins-safe-1-deny-cli-plugins-surface
---

# Delta — cli (WATCH)

## Added

### REQUIREMENT REQ-cli-004

The CLI SHALL provide `plugins list` and `plugins run <name>` and honor `--non-interactive` / CORVIDINHO_NON_INTERACTIVE / FLEDGE_NON_INTERACTIVE; doctor SHALL report loaded plugin count.

Acceptance Criteria
- `corvidinho plugins list` exits 0 and shows github + meta commands.
- Doctor includes a plugins check with command count.

## Modified

### SPEC SECTION Purpose

Operator surface includes plugins list/run and non-interactive deny for dangerous tools.

### SPEC SECTION Invariants

plugins list/run load builtins and honor non-interactive deny; doctor reports plugin count.

### SPEC SECTION Dependencies

Consumes plugins module for loadBuiltins/list/size/runPlugin/helpers.

### SPEC SECTION Behavioral Examples

Add Scenario: Plugins list.

### SPEC SECTION Change Log

plugins list/run + non-interactive + doctor plugin count (2026-09-26, corvid-agent).
