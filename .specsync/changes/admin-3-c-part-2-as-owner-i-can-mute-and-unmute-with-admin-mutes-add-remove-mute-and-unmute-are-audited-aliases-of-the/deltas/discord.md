---
module: discord
change: admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the
---

# Delta: discord (/admin mutes, with /mute and /unmute as audited aliases — ADMIN-3.c part 2)

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

ADMIN-3.c (part 2, mutes): the owner-only `/admin mutes add|remove` (one
required `user`, USER option) SHALL mute / unmute that user in this same live
in-memory mute set, and `/mute` / `/unmute` SHALL be aliases served by the
same helper (`applyMuteChange`). Every mute change SHALL be audited (SAFE-5,
surface `discord:admin`, actions `admin-mutes-add` / `admin-mutes-remove`
whichever spelling ran, args digest of the route and target only): a
`started` row before the set changes, then `ok`; with no trail wired or a
trail that throws, the command SHALL refuse (`audit log unavailable
(SAFE-5)`) and leave the set unchanged — an unaudited mute is never made. A
mute of the configured owner or of the caller SHALL be refused with
`MUTE_SELF_OR_OWNER_REFUSED` and one `denied` row. A mute already in place,
an unmute of someone not muted or a missing user SHALL change nothing and
write no row. Mutes SHALL stay in memory until a restart (the
`DISCORD_MUTED_USER_IDS` seed still applies at start); the mute reply SHALL
say so and point to `/admin deny add user:` for a lasting block, and an
unmute of a seeded id SHALL say the next restart mutes them again. No new
env var, config key, table, column or slash command name.

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
- Owner `/admin mutes add user:M` mutes M at once (M's `/status` gets `MUTED`, M's @mention gets the one `MUTED` notice and no run); the ephemeral reply says the mute lasts until the bridge restarts and names `/admin deny add user:`; the trail holds `admin-mutes-add` `started` then `ok`. `/admin mutes remove user:M` unmutes with `admin-mutes-remove` `started` then `ok`.
- `/mute` / `/unmute` write the same actions, outcomes and args digest as `/admin mutes add|remove` for the same target.
- `/admin mutes add` or `/mute` of the owner, or of the caller, gets `MUTE_SELF_OR_OWNER_REFUSED`, one `admin-mutes-add` `denied` row, and the set is unchanged.
- With the trail throwing or not wired, `/admin mutes add|remove`, `/mute` and `/unmute` reply `audit log unavailable (SAFE-5)` and the set is unchanged.
- A mute already in place, an unmute of someone not muted and a missing user write no audit row.
- `/admin config show` counts mutes (in memory until restart) and names `/admin mutes add|remove` among the updatable knobs.

### REQUIREMENT REQ-discord-011

The slash dispatcher SHALL resolve the caller's permission level at run time
and SHALL refuse before invoking the handler when the resolved level is below
the command's declared `minPermission` (DISCORD-7). Admin-shaped commands
`/mute` and `/unmute` SHALL require ADMIN. Empty admin user/role allowlists
SHALL mean nobody is ADMIN (default-deny). Discord application-command
registration alone SHALL NOT authorize admin actions. Fixture tests SHALL cover
non-admin refuse without a live Discord token. The bridge SHALL NOT introduce
ProcessManager or weaken channel/user/role default-deny allowlists.

`/admin mutes add|remove` SHALL require ADMIN like every `/admin`
subcommand: the dispatcher floor, then the `/admin` handler's own re-check,
which appends an `admin-mutes-add|remove` `denied` row for a caller it
refuses. `/mute` and `/unmute` keep their ADMIN floor and SHALL be aliases of
`/admin mutes add|remove` (the same audited helper, REQ-discord-010), so a
fixture context that runs them SHALL wire `recordAudit`.

Acceptance Criteria
- Non-admin `/mute`/`/unmute` → not authorized; mute set unchanged.
- Admin user or admin role → mute/unmute mutates in-memory set.
- Channel allowlist refuse still wins before permission re-check.
- Empty admin lists ⇒ no ADMIN; secrets out of repo; no ProcessManager.
- Non-owner `/admin mutes add|remove` → not authorized at dispatch (no row); at the `/admin` handler re-check → not authorized with an `admin-mutes-*` `denied` row; the mute set unchanged.
- With `recordAudit` wired, the owner's `/mute` / `/unmute` (dispatcher, admin re-auth and owner fixtures) mutate the in-memory set as before.
