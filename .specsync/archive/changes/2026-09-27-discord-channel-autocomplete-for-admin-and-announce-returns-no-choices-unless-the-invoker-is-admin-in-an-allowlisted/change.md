---
id: discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted
state: archived
type: bug_fix
base_commit: fbaa84b7cda1bf2b462baea44cad20ef93e0df4f
---

# Discord channel autocomplete for /admin and /announce returns no choices unless the invoker is ADMIN in an allowlisted channel

## Intent

Discord channel autocomplete for /admin and /announce returns no choices unless the invoker is ADMIN in an allowlisted channel

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- Every channel autocomplete request (/admin channels add|remove, /announce channel) responds with an empty choice list unless the invoker is ADMIN in an allowlisted channel: the channel passes the slash channel allowlist gate, the actor passes the actor gate (deny users/roles win, user/role allowlist applies), and resolvePermissionLevel with the live mute set is ADMIN (the configured owner). Non-owners, a muted or deny-role owner, any caller outside an allowlisted channel, a bridge with no owner, and a gateway with no gate wired all get []. The owner in an allowlisted channel keeps today's choices (guild text channels for add/announce; the live allowlist for remove). Regression tests in tests/discord.channel-autocomplete.test.ts fail on main and pass with the fix; tsc --noEmit and bun test green.

## No-spec Rationale

Not applicable
