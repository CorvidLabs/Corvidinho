---
change: harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge
artifact: context
---

# Context

#64 shipped MEMORY + ACL (#41 / #59). Review of `plugins/memory/commands.ts`
on main (6cb5f18) found the ACL enforced by the store is bypassable at the
plugin layer, which is the layer the LLM tool loop calls:

- `resolveUser()` prefers `--user <id>` argv over `CORVIDINHO_ACTING_DISCORD_USER_ID`.
  `memory-store` / `memory-recall` are non-dangerous, minTier 0, so they are in
  every default tool catalog. The model can read or upsert any user's memories
  (MEMORY-ACL-1 / MEMORY-ACL-2 broken).
- `resolveIsAdmin()` accepts `--admin` argv, so the model can self-assert ADMIN
  for forget/override (MEMORY-ACL-3/4, ADMIN-4 broken once an operator
  allowlists those dangerous commands).
- `--db <path>` argv lets the model point the store at any file path.
- `--confirm` is a boolean in the same call — a single tool call can erase
  (SAFE-4 two-phase not actually met).
- `--include-deleted` lets anyone read soft-deleted (forgotten) content back.
- Discord spawn only sets `CORVIDINHO_ACTING_DISCORD_USER_ID` when present, so a
  value in the bridge's own env leaks into schedule/other runs; WATCH spawn
  inherits `process.env` unchanged.

HI is already captured (hi/memory.md MEMORY-ACL-1..5, hi/admin.md ADMIN-4,
hi/safe.md SAFE-4). This is a bug fix to meet it — no new acceptance criteria,
no slash command, no schema change (PR #70 owns schema v4).
