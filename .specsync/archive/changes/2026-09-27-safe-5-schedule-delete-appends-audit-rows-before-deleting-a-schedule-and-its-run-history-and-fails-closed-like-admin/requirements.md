---
change: safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin
artifact: requirements
---

# Requirements

- SAFE-5 (captured in `hi/safe.md`): "Destructive actions leave a tamper-evident audit trail I can verify later." Deleting a schedule drops its row and its whole run history, so it is a destructive action.
- Modify REQ-discord-020 (delta `deltas/discord.md`): `/schedule delete` appends `started` before deleting, then `ok`/`error`; a non-ADMIN delete appends `denied`; it fails closed with `audit log unavailable (SAFE-5)` when the trail throws or is not wired, as `/admin` does (REQ-discord-043).
- No new REQ, env var, config key, slash command, option, schema or package version.
