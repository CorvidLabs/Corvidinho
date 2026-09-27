---
module: discord
change: discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed
---

# Delta: discord (an ask button press passes the actor gate and mute/rate limit like chat and slash, REQ-discord-201 / REQ-discord-010)

## Modified

### REQUIREMENT REQ-discord-010

The bridge SHALL apply per-user sliding-window rate limits and an in-memory
mute set so one user cannot melt the box without punishing everyone else
(DISCORD-6). Rate limit and mute checks SHALL run on mention/reply/thread
continue and on slash dispatch after the channel allowlist gate. Optional
`rateLimitByLevel` SHALL override max messages for a numeric permission level
when provided. Mute seed MAY load from env; mute/unmute helpers mutate the
in-memory set (no SQLite in this thin slice). The bridge SHALL NOT introduce
ProcessManager or weaken allowlists. Fixture tests SHALL cover per-user
independence without a live Discord token.

The permission level that `rateLimitByLevel` (`DISCORD_RATE_LIMIT_BY_LEVEL`)
keys on SHALL be the actor's level from `resolvePermissionLevel` (user id,
role ids, allowlist, configured owner; mutes are checked before the rate
limit) on both the chat path (`routeMessage`) and slash dispatch, unless a
caller passes an explicit level (`RouterDeps.rateLimit.permLevel` /
`SlashContext.permLevelFor`). `/mute` SHALL refuse a target that is the
invoker or the configured owner (IDENTITY-2) with an ephemeral message and
SHALL leave the mute set unchanged, so the owner can never mute themselves
out of ADMIN and `/unmute` until restart. MessageCreate has no ephemeral:
a muted or rate-limited user's @mention/reply/thread message SHALL get at
most one public notice (`MUTED` / `RATE_LIMITED`) per user per rate-limit
window (`claimRefusalNotice`); later refusals in that window SHALL be
silent, still with no session and no agent run. Slash refusals SHALL stay
ephemeral on every call (DISCORD-DENY / Discord's 3 s ack). No new env var,
slash command, table or column.

An ask button press (DISCORD-ASK, open or pick) SHALL run the same mute and
rate limit check against the same per-user state as chat and slash, after the
channel gate (REQ-discord-212) and the actor gate (REQ-discord-201). The
level that `rateLimitByLevel` keys on for a press SHALL be the presser's
level from `resolvePermissionLevel` (user id, role ids, allowlist, configured
owner; mute is checked first). A press needs an ack, so a muted presser SHALL
get the ephemeral `MUTED` reply and a rate-limited one the ephemeral
`RATE_LIMITED` reply. On either refusal the agent SHALL NOT run, nothing
SHALL be sent or edited, and the pending ask SHALL stay as it was, so a muted
user cannot keep a session going by buttons. No new env var, slash command,
table or column.

Acceptance Criteria
- Default window 60s / max 10; env override for window/max + muted seed.
- User A rate-limited or muted → refuse A; user B still served.
- `rateLimitByLevel` override applies when permLevel provided.
- Mention/reply/thread continue and slash share the same per-user limits/mutes.
- No ProcessManager; secrets out of repo; default-deny allowlists unchanged.
- With `DISCORD_RATE_LIMIT_MAX=3` and `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}`, the owner's 4th and later `/status` and @mentions in the window are served; a member's 4th `/status` gets an ephemeral "Slow down!" and a member's 4th @mention is refused.
- A member who passes only by an allowed role is limited at the STANDARD (2) level max on chat and slash; an explicit `permLevelFor` still overrides.
- Owner `/mute user:<owner>` gets an ephemeral refusal and the owner is not muted; `/unmute` and `/status` still work for the owner. Any invoker's `/mute` of the configured owner, and a self-mute with no owner configured, are refused the same way. `/mute` of another user still mutes them.
- A muted user who sends 5 @mentions gets exactly one public reply and no session or agent run; a rate-limited user (max 1) who sends 5 gets one public "Slow down!"; a peer is still served.
- After a notice, a muted user's reply-to-bot in the same window is refused silently; once the window has passed since that notice, the next refusal notifies once again.
- A muted user's `/status` gets the ephemeral `MUTED` reply on every call and nothing is posted publicly.
- A muted session owner's ask button press (open or pick) gets only the ephemeral `MUTED` reply, press after press: the agent does not run, nothing is sent or edited, and the ask stays pending; after `/unmute` the same button resumes the session.
- With `DISCORD_RATE_LIMIT_MAX=1`, a member's pick after their @mention gets only the ephemeral `RATE_LIMITED` reply and the ask stays pending, while another user is still served; with `DISCORD_RATE_LIMIT_BY_LEVEL={"3":100}` the owner's pick after their @mention still resumes.


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

An ask button press (DISCORD-ASK, open or pick) SHALL also gate the actor
with `gateActor`, after the channel gate (REQ-discord-212) and before
mute/rate, using the role ids the gateway reads from the interaction's member
(`ComponentInteraction.roleIds`, as slash reads them). A refused press SHALL
get only the ephemeral zero-width ack (DISCORD-DENY-3), even from the session
owner; the agent SHALL NOT run, nothing SHALL be sent or edited, and the
pending ask SHALL stay as it was.

Acceptance Criteria
- With `users = ["leif"]` and `deny_users = ["mallory"]`, mallory and an unlisted member get a silent refuse on @mention, reply-to-bot and thread continuation, and no session is created.
- `/work`, `/session start` and `/status` by mallory or an unlisted member return `user_not_allowlisted` with only an ephemeral zero-width ack; no agent run, work task or session is created.
- A listed user, a member with an allowed role, and the owner not on the user list still start sessions and run slash commands.
- With empty user and role lists any member of an allowlisted channel may chat, but a deny-listed user or role is still refused.
- A session owner who is then deny-listed, or who presses holding a deny-listed role, gets only the ephemeral zero-width ack on an ask button (open or pick), also when muted: the agent does not run, nothing is sent or edited, and the ask stays pending.
- With a non-empty user allowlist that leaves out the session owner, their pick gets the zero-width ack; the same member holding an allowed role (role ids from the press) resumes, and so does the owner not on the list.
