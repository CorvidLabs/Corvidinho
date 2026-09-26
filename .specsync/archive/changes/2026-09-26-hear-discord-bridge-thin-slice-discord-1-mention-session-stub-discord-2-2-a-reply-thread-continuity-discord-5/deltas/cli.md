---
module: cli
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
---

# Delta — cli (discord bridge / protocol-version)

## Added

### REQUIREMENT REQ-cli-008

The CLI SHALL expose `discord bridge` to start the HEAR bridge and `--protocol-version` printing the wire protocol integer. Doctor SHALL note Discord token and allowlist go-live requirements without printing secret values.

Acceptance Criteria
- `corvidinho --protocol-version` prints `1` and exits 0.
- `corvidinho discord bridge` without token exits non-zero with clean explanation.
- Help documents `discord bridge` and Discord env/allowlist vars.

## Modified

### SPEC SECTION Purpose

Operator surface includes Discord HEAR bridge entrypoints.

### SPEC SECTION Invariants

discord bridge never logs token values; missing token is a clean exit; empty channels refuse start.

### SPEC SECTION Change Log

discord bridge + --protocol-version HEAR surface (2026-09-26, corvid-agent, #5).
