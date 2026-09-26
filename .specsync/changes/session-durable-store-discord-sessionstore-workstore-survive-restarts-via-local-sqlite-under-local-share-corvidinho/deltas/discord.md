---
module: discord
change: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
---

# Delta — discord (SESSION durable store + soft TTL)

## Added

### REQUIREMENT REQ-discord-019

Discord `SessionStore` (and `WorkStore`) SHALL optionally persist to a local
SQLite database under the shared Corvidinho data directory
(`~/.local/share/corvidinho/` by default, overridable via `CORVIDINHO_DATA_DIR`)
so session and work stubs survive process restarts (SESSION durable substrate;
aligns with MEMORY-1 path for future #41 — this requirement does **not**
implement MEMORY ACL or conversation recall).

Soft TTL SHALL default to about **45 minutes** (within SESSION-2’s 30–60 minute
band), overridable via `CORVIDINHO_SESSION_TTL_MS` clamped to that band.
Continued activity (`touch` / continue paths) SHALL refresh `lastActivityAt`
(SESSION-2). Lookups for sessions idle past the TTL SHALL treat them as expired
and SHALL NOT continue them, so the next eligible mention starts a fresh
session (SESSION-1 / SESSION-3). Cross-session continuity remains MEMORY’s
responsibility later (SESSION-4), not a long-lived ProcessManager.

The bridge SHALL open the shared DB when starting (unless tests inject
in-memory stores) and SHALL NOT introduce ProcessManager, `/schedule`, or
MEMORY product surfaces. Fixture tests SHALL cover persist/reload and TTL
expiry without a live Discord token.

Acceptance Criteria
- Session create + bot-message/thread maps reload from SQLite after reopen.
- Work task stubs reload from the same DB after reopen.
- Default TTL ~45m; env override clamped to 30–60m.
- Idle past TTL → getByThread/getByBotMessage/get/list omit or purge; continue path does not resume.
- Activity within TTL keeps continue_session.
- Data dir defaults to `~/.local/share/corvidinho/`; `CORVIDINHO_DATA_DIR` overrides.
- No ProcessManager; no /schedule; no MEMORY ACL; secrets out of repo; existing allowlists unchanged.
- Fixture tests pass without live Discord token.
