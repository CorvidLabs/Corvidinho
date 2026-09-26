---
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
artifact: docs
---

# Docs

- Update `docs/BOX-UPDATE.md`: sessions/work now durable under
  `~/.local/share/corvidinho/` (not cleared solely by process restart).
- STATUS roadmap: SESSION durable store in Done / in-flight for #37 substrate.
- Env notes: `CORVIDINHO_DATA_DIR`, `CORVIDINHO_SESSION_TTL_MS` in `.env.example`.
