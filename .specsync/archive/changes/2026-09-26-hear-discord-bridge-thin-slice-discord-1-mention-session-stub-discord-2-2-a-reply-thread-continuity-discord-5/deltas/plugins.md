---
module: plugins
change: hear-discord-bridge-thin-slice-discord-1-mention-session-stub-discord-2-2-a-reply-thread-continuity-discord-5
---

# Delta — plugins (discord-post-message dangerous)

## Added

### REQUIREMENT REQ-plugins-009

The system SHALL register `discord-post-message` as a **dangerous** plugin (externally visible write). Non-interactive runs SHALL deny unless allowlisted (SAFE-1). Channel target MUST pass Discord channel allowlist (DISCORD-5 / ALLOW-3).

Acceptance Criteria
- `plugins list` shows `discord-post-message` with dangerous=true.
- Non-interactive without allowlist → deny (exit 2).
- Missing/empty channel allowlist or non-allowlisted channel → not authorized.

## Modified

### SPEC SECTION Purpose

Plugin host includes Discord outbound post as dangerous.

### SPEC SECTION Invariants

discord-post-message is dangerous; empty Discord channel allow = refuse.

### SPEC SECTION Change Log

discord-post-message dangerous plugin (2026-09-26, corvid-agent, #5).
