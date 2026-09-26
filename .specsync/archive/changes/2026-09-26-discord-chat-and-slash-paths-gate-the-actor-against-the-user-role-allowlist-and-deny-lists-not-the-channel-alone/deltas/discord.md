---
module: discord
change: discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone
---

# Delta — discord (actor gate on chat + slash)

## Added

### REQUIREMENT REQ-discord-201

Every inbound Discord @mention, reply-to-bot continuation, thread
continuation and slash command SHALL, after the channel gate, gate the actor
with `gateActor` (ALLOW-3 / ALLOW-5 / DISCORD-5). A user on `denyUsers` or
holding any role on `denyRoles` SHALL be refused (deny always wins). When
the user or role allowlist is non-empty, the actor SHALL pass only when the
user is listed, holds a listed role, or is the configured owner (IDENTITY-1/2);
when both lists are empty the channel gate alone applies (ROLES-CHAT-1).
Refusal on MessageCreate SHALL be silent: no public reply, no session
created, no agent run (DISCORD-DENY-1). Refusal on slash SHALL be the
ephemeral zero-width ack for every command, before mute/rate and any handler,
so nothing is spawned (DISCORD-DENY-3). Mute keeps its own reply (DISCORD-6).
No new env var, slash command, table or column.

Acceptance Criteria
- With `users = ["leif"]` and `deny_users = ["mallory"]`, mallory and an unlisted member get a silent refuse on @mention, reply-to-bot and thread continuation, and no session is created.
- `/work`, `/session start` and `/status` by mallory or an unlisted member return `user_not_allowlisted` with only an ephemeral zero-width ack; no agent run, work task or session is created.
- A listed user, a member with an allowed role, and the owner not on the user list still start sessions and run slash commands.
- With empty user and role lists any member of an allowlisted channel may chat, but a deny-listed user or role is still refused.
