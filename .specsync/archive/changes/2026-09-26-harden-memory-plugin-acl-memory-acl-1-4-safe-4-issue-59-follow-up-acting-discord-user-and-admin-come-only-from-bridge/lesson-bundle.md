# Lesson bundle — harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Harden memory plugin ACL (MEMORY-ACL-1..4 / SAFE-4 / issue #59 follow-up): acting Discord user and ADMIN come only from bridge-set env never model argv (--user/--admin/--db refused); ADMIN re-checked at handler time against live admin config with empty=deny-all; include-deleted is ADMIN-only; forget/override become real two-phase with an HMAC confirm token confirmed from a different turn; Discord/WATCH spawns always overwrite acting env
- **Kind**: BugFix
- **Specs**: plugins, discord, watch
- **Paths**: plugins/memory/, src/memory/, src/discord/agent-client.ts, src/watch/agent-client.ts, tests/memory.plugins.test.ts, tests/memory.confirm.test.ts, tests/memory.spawn-env.test.ts, specs/plugins/, specs/discord/, specs/watch/, CHANGELOG.md, STATUS.md, docs/discord.md
- **Acceptance**: Memory plugins refuse --user/--admin/--db argv so the model cannot assert identity, ADMIN, or store path (MEMORY-ACL-1/2/3); acting user comes only from CORVIDINHO_ACTING_DISCORD_USER_ID (missing => refuse); ADMIN for forget/override/include-deleted is re-checked in the handler: acting user in CORVIDINHO_DISCORD_ADMIN_USERS, or bridge-set CORVIDINHO_ACTING_IS_ADMIN only when admin roles are configured; empty admin lists => deny-all even with the env bit; denied/muted users never ADMIN (ADMIN-4 / MEMORY-ACL-4); self-forget still ADMIN-only; forget/override are two-phase (SAFE-4): phase 1 returns an HMAC confirm token bound to op+actor+memory id+row updated_at(+content hash) with 10m expiry and no memory content, phase 2 --confirm <token> must come from a different process/turn and is single-use; recall --include-deleted ADMIN-only; Discord spawn always overwrites CORVIDINHO_ACTING_* and WATCH spawn clears them; no schema change; no new slash; fixture tests + SpecSync + fledge verify green

## Evidence

- Verification commit: `808a88df1c08b8f6d7b4f9ee8b1a48f57ea7bc6d`
- Base commit: `6cb5f18ab909f4bc5e6529b8c29df121e0833c4e`
- Verified by: `specsync check --spec cli --spec discord --spec plugins --spec watch`

## From the change's context.md

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

## From the change's design.md

# Design

- `src/memory/confirm.ts` — `issueConfirmToken(db, binding)` /
  `checkConfirmToken(db, token, binding)`. Token `mc1.<expiresAt>.<turn>.<hmac>`;
  HMAC-SHA256 over `[op, actor, memoryId, updatedAt, sha256(content)|"", expiresAt, turn]`
  with a 32-byte secret created on first use via
  `INSERT OR IGNORE INTO schema_meta ('memory_confirm_secret', …)`.
  `turn` = a random id per process (each Discord message and each CLI
  `plugins run` is a new process; one tool loop is one process), with a
  `setConfirmTurnForTests` seam like `setRequesterPermCheckerForTests`.
  Check order: shape → HMAC (timing-safe) → expiry → same-turn.
- `plugins/memory/commands.ts` — reject identity/path flags first; actor from
  env; `actingIsAdmin(env, userId)` loads the allowlist (deny list) at handler
  time; store opened from env data dir only (`CORVIDINHO_DATA_DIR` /
  `CORVIDINHO_MEMORY_INMEM` test seam).
- `src/discord/agent-client.ts` / `src/watch/agent-client.ts` — env hygiene only.
- No store/schema change; `MemoryStore.forget/override` keep their `isAdmin`
  parameter (now fed by the handler-time check).

## From the change's testing.md

# Testing

- `tests/memory.plugins.test.ts`: danger markings; `--user`/`--admin`/`--db`
  (incl. `=` forms) refused on all four commands; no actor env ⇒ refused;
  store/recall scoped to env actor (other actor sees nothing); empty admin
  lists + `CORVIDINHO_ACTING_IS_ADMIN=1` ⇒ forget/override refused; self-forget
  non-admin refused opaquely; admin two-phase: phase 1 token (no content),
  same-turn confirm refused, new-turn confirm ok, replay refused; token for a
  different id refused; override content change between phases refused;
  deny-listed admin refused; role-admin needs roles configured + env bit;
  `--include-deleted` non-admin refused, admin ok.
- `tests/memory.confirm.test.ts`: malformed, tampered, expired, same-turn,
  binding mismatch (actor / id / updatedAt / content), secret persisted once.
- `tests/memory.spawn-env.test.ts`: Discord spawn overwrites acting env even
  when the parent env carries a stale actor; WATCH spawn clears it.
- `bun test`, `bunx tsc --noEmit`, `specsync check`,
  `fledge lanes run verify --non-interactive`.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-010 | `tests/memory.plugins.test.ts` — four commands, markings, env actor store/recall |
| REQ-plugins-011 | `tests/memory.plugins.test.ts` + `tests/memory.confirm.test.ts` — argv refusal, handler-time ADMIN, two-phase token |
| REQ-discord-021 | `tests/memory.spawn-env.test.ts` + `tests/memory.store.test.ts` — spawn env overwrite; store ACL unchanged |
| REQ-watch-008 | `tests/memory.spawn-env.test.ts` — WATCH spawn clears acting env |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/discord/context.md`
- `specs/watch/context.md`
