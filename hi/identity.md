---
hi: 1
families: [IDENTITY]
owner: leif
---

# Identity

## Intent

Corvidinho knows a durable owner (Discord user id, optional GitHub / display such as 0xLeif) from local config or DB so admin slash and autonomy pings have a real target — empty owner means no admin.

## Criteria

- **IDENTITY-1**  I can declare a durable owner (Discord user id plus optional GitHub login or display such as 0xLeif) in local config or DB that survives restarts.
- **IDENTITY-2**  Only the configured owner may use admin slash commands; non-owners cannot.
- **IDENTITY-3**  Empty owner config means nobody is admin — default-deny.

## Notes (not numbered AC)

- Community vs ADMIN tool gates (read/chat only for non-owners): **ROLES-CHAT-1..7** in [`hi/roles.md`](roles.md) — two-tier interim until #65 team role.
