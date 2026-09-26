# Lesson bundle — session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SESSION durable store: Discord SessionStore (+ WorkStore) survive restarts via local SQLite under ~/.local/share/corvidinho/ (align MEMORY #41 path); soft TTL 30-60m keep-alive on activity; idle/stale → fresh session (SESSION-1..4); no ProcessManager; no /schedule; no MEMORY ACL
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/discord/session-store.ts, src/discord/work-store.ts, src/discord/bridge.ts, src/discord/message-router.ts, src/store, tests, STATUS.md, docs/BOX-UPDATE.md
- **Acceptance**: Discord SessionStore (+ WorkStore) persist to local SQLite under ~/.local/share/corvidinho/ and reload after restart; soft TTL ~45m (configurable 30-60m) keep-alive on activity; idle/stale lookups start fresh (SESSION-1..3); cross-session continuity deferred to MEMORY not long-lived process (SESSION-4); no ProcessManager; no /schedule; no MEMORY ACL; fixture tests without live Discord; SpecSync+fledge verify green

## Evidence

- Verification commit: `028c40793d75e1288b5f0b0121ed64afe60880e2`
- Base commit: `59a92f9aa95a71e27e23d21967ff6afa4a209c3f`
- Verified by: `specsync check --spec agent --spec cli --spec discord`

## From the change's context.md

# Context

CoS cut order after watch #56: **SESSION durable first** — schedules and MEMORY
need a local store. Discord `SessionStore` / `WorkStore` are in-memory Maps;
box updater docs note restart clears sessions. HI `hi/session.md` SESSION-1..4
and MEMORY path `~/.local/share/corvidinho/` are already captured.

Constraints:
- HI-first: do not invent AC; implement SESSION-1..4 + shared SQLite path only.
- No `/schedule`, no MEMORY ACL / conversation recall (waiting Leif HI confirm).
- No ProcessManager. Prefer `bun:sqlite`. Align DB location with future #41 MEMORY.
- Soft TTL ~30–60m (default 45m); activity resets; idle/stale → fresh session.

## From the change's design.md

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

## From the change's testing.md

# Testing

- Unit: open DB under temp `CORVIDINHO_DATA_DIR`; create session; new store
  instance reloads same id / thread / bot-message maps.
- Soft TTL: session with `lastActivityAt` older than TTL is not returned by
  get/getByThread/getByBotMessage/list; touch within TTL keeps continue path.
- WorkStore: create + setStatus survives reopen.
- Existing discord router/slash tests still pass (in-memory default when no DB).
- No live Discord token; `bun test` + `fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/discord/context.md`
