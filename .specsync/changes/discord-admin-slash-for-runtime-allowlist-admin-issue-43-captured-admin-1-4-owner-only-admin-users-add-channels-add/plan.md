---
change: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
artifact: plan
---

# Plan

1. Allowlist file editor + atomic write + live splice
   (`src/discord/admin-allowlist.ts`).
2. `/admin` handler with handler-time ADMIN re-check, guards, audit and
   config show (`src/discord/command-handlers/admin.ts`).
3. Command body + name, dispatcher entry (minPermission ADMIN), slash types
   (`subcommandGroup`, `recordAudit`), gateway group flattening, bridge audit
   wiring, index exports, deny tip text.
4. Fixture tests (`tests/discord.admin-slash.test.ts`); register-count tests
   move from eight to nine commands.
5. Docs (`docs/discord.md`, `docs/BOX-UPDATE.md`, `allowlist.example.toml`),
   spec files list, REQ-discord-043 added, REQ-discord-009 modified.
