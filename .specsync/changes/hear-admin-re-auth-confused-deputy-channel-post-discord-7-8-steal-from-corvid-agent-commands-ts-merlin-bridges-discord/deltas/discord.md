---
module: discord
change: hear-admin-re-auth-confused-deputy-channel-post-discord-7-8-steal-from-corvid-agent-commands-ts-merlin-bridges-discord
---

# Delta — discord (DISCORD-7 admin re-auth + DISCORD-8 confused-deputy)

## Added

### REQUIREMENT REQ-discord-011

The slash dispatcher SHALL resolve the caller's permission level at run time
and SHALL refuse before invoking the handler when the resolved level is below
the command's declared `minPermission` (DISCORD-7). Admin-shaped commands
`/mute` and `/unmute` SHALL require ADMIN. Empty admin user/role allowlists
SHALL mean nobody is ADMIN (default-deny). Discord application-command
registration alone SHALL NOT authorize admin actions. Fixture tests SHALL cover
non-admin refuse without a live Discord token. The bridge SHALL NOT introduce
ProcessManager or weaken channel/user/role default-deny allowlists.

Acceptance Criteria
- Non-admin `/mute`/`/unmute` → not authorized; mute set unchanged.
- Admin user or admin role → mute/unmute mutates in-memory set.
- Channel allowlist refuse still wins before permission re-check.
- Empty admin lists ⇒ no ADMIN; secrets out of repo; no ProcessManager.

### REQUIREMENT REQ-discord-012

When posting to a Discord channel on a user's behalf (`discord-post-message`
with requesting user id), the system SHALL verify that the requesting user
could post there (ViewChannel + SendMessages) — not only that the bot could
(DISCORD-8 / Merlin confused-deputy). Channel allowlist SHALL still gate first.
Optional strict mode SHALL refuse posts missing requesting user id. Archive
cross-channel-guard advisory SHALL NOT be treated as the ACL. Fixture tests
SHALL cover allow/deny without a live Discord token. The bridge SHALL NOT
introduce ProcessManager or weaken allowlists.

Acceptance Criteria
- Requester lacks send/view → refuse; no post.
- Requester has View+Send + allowlisted channel → may post (dry-run ok in tests).
- Strict mode + missing requesting_user_id → refuse.
- Allowlist deny still wins before requester check.
- No ProcessManager; secrets out of repo; default-deny unchanged.

## Modified

### SPEC SECTION Purpose

Thin Discord HEAR bridge: gateway → message-router → session stub with live
thinking status, slash ops, per-user rate limits/mutes, admin re-auth at
command run time, and confused-deputy requester checks on outbound posts
(DISCORD-1/2/2.a/3/4/5/6/7/8).

### SPEC SECTION Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, WorkStore,
goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, RATE_LIMITED,
MUTED, PermissionLevel, resolvePermissionLevel, checkRateLimit, muteUser,
unmuteUser, isMuted, evaluateRequesterCanSend, agent/gateway helpers,
thinking-status builders/controller, slash command bodies + dispatch
(handleSlashInteraction, buildSlashCommandBodies including mute/unmute);
loadDiscordPlugins registers discord-post-message (requester check).

### SPEC SECTION Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
empty admin lists = nobody ADMIN; missing token clean exit; no ProcessManager;
secrets out of repo; discord-post-message dangerous; thinking status edits one
progress message in-place; slash handlers re-check channel allowlist and
minPermission before acting; rate/mute refuse only the offending user;
outbound post with requesting_user_id verifies requester channel perms.

### SPEC SECTION Behavioral Examples

Mention→start_session; reply/thread→continue_session; slash /session|/status|
/agents|/work on allowlisted channel; admin /mute|/unmute; non-admin mute
refused; rate-limited or muted user refused while peer continues;
discord-post-message with requester who cannot send → refuse; missing token /
empty channels refuse cleanly; session run posts progress then Done.

### SPEC SECTION Error Cases

Missing token; empty channels; protocol mismatch; not authorized (message,
slash, or insufficient permission); muted; rate limited; requester cannot send;
strict missing requesting_user_id; SAFE-1 deny for discord-post; agent failure
marks progress error then reports; unknown slash command refused.

### SPEC SECTION Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

### SPEC SECTION Change Log

DISCORD-7 admin re-auth + DISCORD-8 confused-deputy (2026-09-26, corvid-agent + Merlin, #13).
