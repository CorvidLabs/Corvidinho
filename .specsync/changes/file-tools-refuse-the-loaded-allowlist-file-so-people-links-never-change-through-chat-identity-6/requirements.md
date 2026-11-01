---
change: file-tools-refuse-the-loaded-allowlist-file-so-people-links-never-change-through-chat-identity-6
artifact: requirements
---

# Requirements

- IDENTITY-6 (captured, `hi/identity.md`): "Only I add, change or remove a
  person's links, never through chat." ALLOW-6 (captured, `hi/allow.md`):
  "Widening an allowlist is an explicit config change I make; the agent does
  not grow trust from chatting with someone new." Built here: the file-tool
  half — `files-write`, `files-edit` and `files-delete` never change the
  allowlist file the process reads people from.
- Kept: ADMIN-3.a / ADMIN-3.b (`/admin people` with its SAFE-5 audit rows),
  SAFE-2 / AGENT-1.b / AGENT-18 / ROLES-CHAT-8 file-tool rules and their
  order, SAFE-21 (the shell's refusal of the file), AGENT-1.a.
- Added: REQ-plugins-1204.
- No env var, config key, slash command, plugin command, NDJSON field,
  protocol or schema change.
