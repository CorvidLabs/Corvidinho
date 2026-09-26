---
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
artifact: testing
---

# Testing

- Unit: open DB under temp `CORVIDINHO_DATA_DIR`; create session; new store
  instance reloads same id / thread / bot-message maps.
- Soft TTL: session with `lastActivityAt` older than TTL is not returned by
  get/getByThread/getByBotMessage/list; touch within TTL keeps continue path.
- WorkStore: create + setStatus survives reopen.
- Existing discord router/slash tests still pass (in-memory default when no DB).
- No live Discord token; `bun test` + `fledge lanes run verify --non-interactive`.
