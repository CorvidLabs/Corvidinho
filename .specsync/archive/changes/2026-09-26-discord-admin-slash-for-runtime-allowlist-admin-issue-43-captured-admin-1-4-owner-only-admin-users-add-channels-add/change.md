---
id: discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add
state: archived
type: feature
base_commit: 20fb34ff8db5759a2aad968e74d1d21b4c344b83
---

# Discord /admin slash for runtime allowlist admin (issue #43 captured ADMIN-1..4): owner-only /admin users add, channels add|remove, config show; persists to the allowlist file the bridge already reads (atomic temp+rename, other sections and comments kept) and updates the live allowlist without restart; env values read-only at runtime; empty stays deny-all; SAFE-5 audit rows for mutations

## Intent

Discord /admin slash for runtime allowlist admin (issue #43 captured ADMIN-1..4): owner-only /admin users add, channels add|remove, config show; persists to the allowlist file the bridge already reads (atomic temp+rename, other sections and comments kept) and updates the live allowlist without restart; env values read-only at runtime; empty stays deny-all; SAFE-5 audit rows for mutations

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Owner-only /admin slash (ADMIN minPermission plus an explicit handler-time re-check; no owner means nobody can run it) approves/adds Discord users (users add) and adds/removes channels (channels add|remove) in the allowlist file the bridge already reads, written atomically with other sections and comments kept, and the live allowlist updates without restart; env-sourced entries are reported read-only; deny-listed ids and removing the last live channel are refused; the first user entry warns that unlisted callers now resolve to BLOCKED; config show gives an ephemeral audit-friendly view (live/file/env counts, updatable knobs) with no secrets; mutations append SAFE-5 audit rows (fail closed when the trail is unavailable); gateway flattens subcommand groups; register count is nine; fixture tests only

## No-spec Rationale

Not applicable
