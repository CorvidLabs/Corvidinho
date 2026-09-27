---
id: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
state: implementing
type: bug_fix
base_commit: 606b993d7175c2f32759e3f02865492e5e884389
---

# Open Discord asks are secret-scrubbed before the session row is saved and the SAFE-6 re-scrub rewrites stored open asks as JSON (SAFE-6)

## Intent

Open Discord asks are secret-scrubbed before the session row is saved and the SAFE-6 re-scrub rewrites stored open asks as JSON (SAFE-6)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A button ask or free-text ask whose question or option label holds a vendor-key-shaped secret is stored in discord_sessions.pending_ask with [redacted:<kind>] in place of the secret, for both the single-object and the JSON-array row, and the session reloads with the same askId, option ids, expiresAt and stubMessageId (SAFE-6); when the scrub rules version rises, the next DB open re-scrubs raw pending_ask rows written by an older build by parsing the JSON, scrubbing its text values and re-serializing it (askId, expiresAt, option ids and stubMessageId byte-identical), the rewritten row stays valid JSON and loads as a pending ask even when a question holds a private-key block with no END line, a second open is a no-op, and a row that is not JSON is scrubbed as text and counted and logged without its content (SAFE-6 re-scrub); SCRUB_RULES_VERSION rises to 3; no SQLite schema version bump, no new table, column, env var, config key, CLI or slash command; regression tests fail on main and pass on the branch

## No-spec Rationale

Not applicable
