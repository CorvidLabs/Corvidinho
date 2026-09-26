---
module: watch
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
---

# Delta — watch (clear memory acting env)

## Added

### REQUIREMENT REQ-watch-008

The WATCH agent spawn SHALL clear `CORVIDINHO_ACTING_DISCORD_USER_ID` and set
`CORVIDINHO_ACTING_IS_ADMIN=0`. GitHub-originated runs have no Discord acting
user, so memory plugins refuse in them (MEMORY-ACL-1) instead of inheriting a
Discord identity from the watcher's environment.

Acceptance Criteria
- WATCH spawn env has an empty acting user and `CORVIDINHO_ACTING_IS_ADMIN=0` even when the parent env sets them.
