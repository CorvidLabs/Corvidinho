---
module: cli
change: steal-specsync-agent-wiring-from-merlin-fledge-plugin-specsync-typed-list-read-check-brief-coverage-change-list-ship
---

# Delta — cli (specsync surface)

## Added

### REQUIREMENT REQ-cli-007

The CLI SHALL expose a thin `specsync` subcommand (`list|read|check|brief|coverage|change-list|ship-status`) that forwards to the SpecSync plugins for operator ergonomics (SPECSYNC-1/2/3/5).

Acceptance Criteria
- `corvidinho specsync list` exits 0 and prints registered modules.
- Help documents the `specsync` surface.
- `task run` Planning can load specs when a task description is provided (`--task`).

## Modified

### SPEC SECTION Purpose

Operator surface includes plugins, task run, and SpecSync list/read/check/brief.

### SPEC SECTION Change Log

SpecSync CLI forwarding + task --task briefing hook (2026-09-26, corvid-agent).
