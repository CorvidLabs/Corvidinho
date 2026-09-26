---
module: store
version: 1
status: draft
files:
  - src/store/db.ts
  - src/store/index.ts
  - src/store/paths.ts
  - src/store/session-ttl.ts

db_tables: []
depends_on: []
---

# Store

## Purpose

Shared local SQLite substrate under `~/.local/share/corvidinho/` (MEMORY-1 path
alignment) for Discord SESSION durability and future MEMORY #41. Soft TTL helpers
implement SESSION-2’s 30–60 minute band. No MEMORY ACL, no /schedule, no
ProcessManager in this module.

## Public API

resolveDataDir, defaultDbPath, openCorvidinhoDb, migrateCorvidinhoDb,
resolveSessionTtlMs, clampSessionTtlMs, isSessionExpired,
SESSION_TTL_DEFAULT_MS / MIN / MAX; OpenDbOptions, DataDirOptions.

## Invariants

Data dir defaults to `~/.local/share/corvidinho`; `CORVIDINHO_DATA_DIR` overrides.
DB file is `{dataDir}/corvidinho.db` (or `:memory:` when requested).
Session TTL default 45m; env `CORVIDINHO_SESSION_TTL_MS` clamped to 30–60m.
Schema creates discord_sessions / bot_messages / work_tasks tables for Discord
stores; no conversation/entity MEMORY tables yet. Secrets never stored here by
this module. No ProcessManager.

## Behavioral Examples

resolveDataDir with empty env → home/.local/share/corvidinho;
CORVIDINHO_DATA_DIR set → that path; openCorvidinhoDb migrates schema; TTL clamp
rejects values outside 30–60m; isSessionExpired true when idle past ttlMs.

## Error Cases

Invalid TTL env falls back to default after clamp; missing parent dirs are
created on open; :memory: ignores path.

## Dependencies

bun:sqlite, node:fs/path/os.

## Change Log

2026-09-26 — session-durable-store: shared SQLite + SESSION soft TTL helpers
(align MEMORY path; Discord SessionStore/WorkStore consumers). No MEMORY ACL.
