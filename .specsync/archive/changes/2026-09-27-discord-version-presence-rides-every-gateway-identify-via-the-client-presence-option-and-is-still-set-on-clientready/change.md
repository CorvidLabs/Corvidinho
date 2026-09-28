---
id: discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready
state: archived
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# Discord version presence rides every gateway IDENTIFY via the Client presence option and is still set on ClientReady (DISCORD-12)

## Intent

Discord version presence rides every gateway IDENTIFY via the Client presence option and is still set on ClientReady (DISCORD-12)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- The live discord.js Client is constructed with the version Custom Status (type 4, state vX.Y.Z from the shared package version, same as /status) as its presence option, so the presence discord.js copies into the gateway IDENTIFY payload at login carries it on the first IDENTIFY and on any non-resumable re-identify after an invalid or expired session, not an empty activity list. The short-lived DISCORD-8 requester-check Client that logs in with the same bot token identifies with the same presence. ClientReady still sets the same presence; a failure there is logged and does not abort slash registration or the bridge. No new slash command, env var, config key or allowlist change. Regression tests fail on main and pass after.

## No-spec Rationale

Not applicable
