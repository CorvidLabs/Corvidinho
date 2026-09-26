---
id: session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho
state: archived
type: feature
base_commit: 59a92f9aa95a71e27e23d21967ff6afa4a209c3f
---

# SESSION durable store: Discord SessionStore (+ WorkStore) survive restarts via local SQLite under ~/.local/share/corvidinho/ (align MEMORY #41 path); soft TTL 30-60m keep-alive on activity; idle/stale → fresh session (SESSION-1..4); no ProcessManager; no /schedule; no MEMORY ACL

## Intent

SESSION durable store: Discord SessionStore (+ WorkStore) survive restarts via local SQLite under ~/.local/share/corvidinho/ (align MEMORY #41 path); soft TTL 30-60m keep-alive on activity; idle/stale → fresh session (SESSION-1..4); no ProcessManager; no /schedule; no MEMORY ACL

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Discord SessionStore (+ WorkStore) persist to local SQLite under ~/.local/share/corvidinho/ and reload after restart; soft TTL ~45m (configurable 30-60m) keep-alive on activity; idle/stale lookups start fresh (SESSION-1..3); cross-session continuity deferred to MEMORY not long-lived process (SESSION-4); no ProcessManager; no /schedule; no MEMORY ACL; fixture tests without live Discord; SpecSync+fledge verify green

## No-spec Rationale

Not applicable
