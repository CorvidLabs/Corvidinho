---
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
artifact: research
---

# Research

- HI: `hi/session.md` SESSION-1..4; `hi/memory.md` MEMORY-1 path
  `~/.local/share/corvidinho/`.
- Issue #37 ancestor notes: soft TTL 30–60m; durable row hygiene ≠ conversation
  memory; skip ProcessManager.
- Bun: `import { Database } from "bun:sqlite"` (built-in; no npm dep).
- CoS: SESSION durable first; do not ship `/schedule` or MEMORY ACL yet.
