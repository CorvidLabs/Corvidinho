---
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
artifact: plan
---

# Plan

1. Add `src/store/` — data-dir helper + `bun:sqlite` open/migrate shared DB.
2. Extend Discord `SessionStore` with optional durable backend + soft TTL;
   expire on get/list; persist create/touch/trackBotMessage.
3. Extend `WorkStore` similarly; wire both from `startBridge` with shared DB.
4. Router continue paths already call `getByThread`/`getByBotMessage` — expired
   returns undefined → fall through to fresh start on mention / no continue.
5. Fixture tests: persist+reload, TTL expiry, TTL keep-alive, WorkStore roundtrip.
6. Spec delta REQ-discord-019; store module scaffold; STATUS + BOX-UPDATE docs.
7. SpecSync check → fledge verify → PR as corvid-agent via `gh`.
