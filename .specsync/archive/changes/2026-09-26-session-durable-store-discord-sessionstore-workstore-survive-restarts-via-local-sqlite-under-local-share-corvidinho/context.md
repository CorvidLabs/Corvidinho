---
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
artifact: context
---

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
