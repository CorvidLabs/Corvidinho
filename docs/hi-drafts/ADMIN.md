---
hi-draft: 1
families: [ADMIN, DISCORD]
owner: leif
status: confirmed-captured-see-hi
issue: 43
---

# ADMIN (draft) — Discord slash admin runtime

> **CAPTURED.** Leif confirmed; live criteria are in `hi/`. This file is historical provenance only.
> Issue: [#43](https://github.com/CorvidLabs/Corvidinho/issues/43). Expands beyond shipped **DISCORD-7** re-auth (#13→#28).

## Intent

From Discord, an ADMIN can approve/add users, add channels, and update bot config without SSHing the box — always re-checked at run time. **Empty = deny-all stays.**

## Proposed criteria (for Leif)

- **ADMIN-1**  Slash admin commands let me add/approve users and add channels to the live allowlists Corvidinho already uses (file/env), without weakening empty=deny-all.
- **ADMIN-2**  Slash admin can show and update safe config knobs (e.g. lists already represented in allowlist/env) with an audit-friendly reply.
- **ADMIN-3**  Every admin-shaped command re-checks ADMIN at handler time (**DISCORD-7**); registration alone is never enough.
- **ADMIN-4**  Non-admins attempting admin commands are refused clearly; empty admin lists mean nobody is ADMIN.

## Provenance (steal, do not invent)

corvid-agent `server/discord/admin-commands.ts` (`/admin channels|users|roles|show|setup|…`), `discord-config.ts`, tests `discord-admin-commands.test.ts`. Persist into Corvidinho allowlist.toml/env shape — do not recreate archive empty=allow-all. See #43 / closed #39.

## Non-goals

ProcessManager; relaxing deny-all; inventing `hi/` before confirm.
