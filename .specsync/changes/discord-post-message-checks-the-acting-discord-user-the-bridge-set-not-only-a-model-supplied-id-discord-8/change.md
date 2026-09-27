---
id: discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8
state: implementing
type: bug_fix
base_commit: 606b993d7175c2f32759e3f02865492e5e884389
---

# Discord-post-message checks the acting Discord user the bridge set, not only a model-supplied id (DISCORD-8)

## Intent

discord-post-message checks the acting Discord user the bridge set, not only a model-supplied id (DISCORD-8)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- In a run the bridge started (non-empty CORVIDINHO_ACTING_DISCORD_USER_ID), discord-post-message runs the DISCORD-8 requester check (ViewChannel + SendMessages via verifyRequesterCanSend) for the acting user even without --requesting-user-id, and refuses with nothing posted when that user lacks View or Send; a --requesting-user-id (or --requester) naming a different user is refused with nothing posted and is never checked in place of the acting user; strict mode is met by the acting user's check; a check that cannot run (Guild Members login refused because Server Members Intent is off, timeout, checker throws) refuses (fail closed) with one scrubbed reason line (SAFE-6) and nothing posted; the channel allowlist deny still wins first; with the acting env empty or unset (operator plugins run, local task run, WATCH) behaviour is unchanged (flag check when given, strict refuses a missing id, a throwing check still throws); fixture tests in tests/discord.requester-perms.test.ts fail on main and pass here; no new env var, flag, config key or command

## No-spec Rationale

Not applicable
