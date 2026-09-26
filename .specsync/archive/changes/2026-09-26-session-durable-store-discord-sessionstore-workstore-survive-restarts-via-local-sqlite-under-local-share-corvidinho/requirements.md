---
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
artifact: requirements
---

# Requirements

1. Shared local data dir defaults to `~/.local/share/corvidinho/` (MEMORY-1 path
   alignment); override via `CORVIDINHO_DATA_DIR` when set.
2. Discord `SessionStore` SHALL persist session stubs + bot-message / thread
   maps to SQLite in that dir and SHALL reload on bridge start so restarts do
   not wipe active maps (SESSION durable substrate).
3. Soft TTL default **45 minutes** (within SESSION-2 30–60m); override via
   `CORVIDINHO_SESSION_TTL_MS` clamped to 30–60m. Activity (`touch`) resets
   `lastActivityAt`. Lookups that find a session idle past TTL SHALL treat it
   as expired and not continue it (SESSION-1 / SESSION-3 → fresh session).
4. `WorkStore` SHALL persist work stubs in the same SQLite DB and reload on
   start (foundation for later schedules; no `/schedule` CLI in this change).
5. Cross-session continuity remains MEMORY’s job later (SESSION-4); this change
   does **not** implement MEMORY ACL, entity recall, or conversation summaries.
6. No ProcessManager. Fixture tests without live Discord token. SpecSync +
   fledge verify green.
