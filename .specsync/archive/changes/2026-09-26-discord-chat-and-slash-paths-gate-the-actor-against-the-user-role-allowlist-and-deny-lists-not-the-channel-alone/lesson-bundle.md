# Lesson bundle — discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord chat and slash paths gate the actor against the user/role allowlist and deny lists, not the channel alone
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/permissions.ts, src/discord/message-router.ts, src/discord/slash-dispatch.ts, src/discord/bridge.ts, tests/discord.actor-gate.test.ts
- **Acceptance**: With a non-empty user or role allowlist, a deny-listed or unlisted member of an allowlisted channel cannot start or continue a chat session (mention, reply, thread) or run any slash command; chat refusal is silent and slash refusal is an ephemeral zero-width ack; deny lists always win; listed users, allowed roles and the owner keep access; empty user+role lists keep the channel-only path

## Evidence

- Verification commit: `72223ffe33cca090e9af2cbb83edfe7e4987939e`
- Base commit: `65cff62fdae8cb0413d92adfe8acb29455fc127f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Bug discord-1 (high). The bridge routed MessageCreate with `channelOnlyGate: true`, so `routeMessage` passed no user/role to `gateInbound`, and the reply-to-bot and thread-continuation paths checked channels only. `handleSlashInteraction` ran only `gateChannel()`; `resolvePermissionLevel` (which returns BLOCKED for deny-listed users and, with a non-empty user/role allowlist, for unlisted ones) was consulted only for commands with a `minPermission` (/mute, /unmute, /admin).

Effect: with `CORVIDINHO_DISCORD_ALLOW_USERS=leif` and `CORVIDINHO_DISCORD_DENY_USERS=mallory` (or the `[discord] users` / `deny_users` file keys), mallory or any unlisted member of an allowlisted channel could @mention the bot, reply to it, continue a thread, or run `/work` / `/session start` and start a real agent run in a worktree on the host. Repro before the fix: `routeMessage` returned `mallory => start_session`; `/work` as mallory returned `{ok:true,handled:true}` and spawned `mallory: cat secrets`.

Constraints: no new env var, slash command or table; the owner (IDENTITY-1/2) must keep access even when not on the user list (the rule `resolvePermissionLevel` already applies); empty user+role lists must keep today's channel-only chat path (ROLES-CHAT-1); mute keeps its own MUTED reply (DISCORD-6).

## From the change's design.md

# Design

New `gateActor({ userId, roleIds, allowlist, owner })` in `src/discord/permissions.ts`: refuse when any role is on `denyRoles`; otherwise refuse when `resolvePermissionLevel` (without the mute set) is BLOCKED. This reuses the existing actor rule, so the owner passes when unlisted and empty user+role lists leave the channel gate alone.

- `routeMessage`: after the channel check on the thread-continue and reply-continue paths, and after the mention check on the start path, call `gateActor`; refuse with `{ kind: "refuse", reason: "user_not_allowlisted" }` and no reply (DISCORD-DENY-1). Non-mention noise stays `ignore`. New optional `RouterDeps.owner`; the bridge passes `config.owner`.
- `handleSlashInteraction`: after the channel gate and before mute/rate, call `gateActor` for every command; refuse with the existing `EPHEMERAL_SILENT_ACK` (ephemeral) and `reason: "user_not_allowlisted"` (DISCORD-DENY-3). The owner can fail here only when deny-listed, and is then not ADMIN, so the admin tip never applies.
- Mute stays with `gateRateOrMute`, so muted users keep the MUTED reply. No new env var, slash command, table or column.

## From the change's testing.md

# Testing

`bun test tests/discord.actor-gate.test.ts`: on main (router/slash cases only, since `gateActor` does not exist there) 5 of 7 tests fail (`mallory => start_session`, `mallory reply => continue_session`, `/work` as mallory returns `{ok:true,handled:true}` and spawns). After the fix 10/10 pass. Full `bun test`, `bunx tsc --noEmit` and the fledge verify lane pass; the existing router, slash, owner, admin and rate/mute tests are unchanged.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-201` | `tests/discord.actor-gate.test.ts` | Deny-listed (`mallory`) and unlisted (`stranger`) members get a silent `refuse` on @mention, reply-to-bot and thread continuation, and no session is created. `/work`, `/session start` and `/status` return `user_not_allowlisted` with only an ephemeral zero-width ack, and nothing is spawned. A listed user, an allowed role and the unlisted owner still start and run. Empty user+role lists keep the channel-only path, while deny-listed users and roles are still refused. A denied role refuses even a listed user and the owner. |

## Where these lessons go

- `specs/discord/context.md`
