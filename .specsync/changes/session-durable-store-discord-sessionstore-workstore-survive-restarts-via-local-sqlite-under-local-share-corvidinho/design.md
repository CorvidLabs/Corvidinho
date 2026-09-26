---
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
artifact: design
---

# Design

## Shared store (`src/store/`)

- `defaultDataDir()` → `$CORVIDINHO_DATA_DIR` or `~/.local/share/corvidinho`
- `openCorvidinhoDb(opts?)` → `bun:sqlite` Database at `{dataDir}/corvidinho.db`
- Schema v1:
  - `discord_sessions` (id PK, channel_id, thread_id, user_id, topic, created_at, last_activity_at)
  - `discord_session_bot_messages` (bot_message_id PK, session_id FK)
  - `discord_work_tasks` (id PK, description, user_id, channel_id, session_id, status, created_at, updated_at, summary)

Future MEMORY tables live in the same file later (#41) — not in this change.

## SessionStore

- Constructor opts: `{ db?, ttlMs?, now?: () => number }`
- Without `db`: in-memory only (tests / prior behavior).
- With `db`: load non-expired rows at construct; persist on mutate.
- Soft TTL: `isExpired(session)` when `now - lastActivityAt > ttlMs`.
  Expired gets purged from maps + DB on access; `list()` omits expired.
- Default ttlMs = 45 * 60 * 1000; clamp env override to [30m, 60m].

## Router

No API change: expired `getBy*` → undefined → mention starts fresh (SESSION-1/3).

## Out of scope

`/schedule`, MEMORY ACL/entities/summaries, WATCH SessionStore, ProcessManager, mute SQLite.

## SpecSync ownership

`src/store/*` is listed under the `discord` module files for this change (canonical owner),
so SESSION durable ships in one change. Physical path stays `src/store/` for future MEMORY #41 reuse.
