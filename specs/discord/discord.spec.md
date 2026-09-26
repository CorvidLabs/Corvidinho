---
module: discord
version: 31
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol-version.ts
  - src/discord/image-attachments.ts
  - src/discord/permissions.ts
  - src/discord/session-store.ts
  - src/discord/work-store.ts
  - src/discord/message-router.ts
  - src/discord/agent-client.ts
  - src/discord/gateway.ts
  - src/discord/bridge.ts
  - src/discord/thinking-status.ts
  - src/discord/slash-commands.ts
  - src/discord/slash-types.ts
  - src/discord/slash-dispatch.ts
  - src/discord/command-handlers/session.ts
  - src/discord/command-handlers/status.ts
  - src/discord/command-handlers/agents.ts
  - src/discord/command-handlers/work.ts
  - src/discord/command-handlers/mute.ts
  - src/discord/requester-perms.ts
  - src/discord/index.ts
  - plugins/discord/index.ts

db_tables: []
depends_on:
  - plugins
  - agent
  - cli
---

# Discord

## Purpose

Thin Discord HEAR bridge: gateway → message-router → session stub with live
thinking status, slash ops, per-user rate limits/mutes, admin re-auth at
command run time, confused-deputy requester checks on outbound posts,
image attachments as local files for the agent, and Merlin-shaped
protocol-version lockstep (DISCORD-1/2/2.a/3/4/5/6/7/8/9/10).

## Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, WorkStore,
goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, RATE_LIMITED,
MUTED, PermissionLevel, resolvePermissionLevel, checkRateLimit, muteUser,
unmuteUser, isMuted, evaluateRequesterCanSend, agent/gateway helpers,
thinking-status builders/controller, slash command bodies + dispatch
(handleSlashInteraction, buildSlashCommandBodies including mute/unmute);
loadDiscordPlugins registers discord-post-message (requester check);
isImageAttachment, extractImageBlocks, enrichPromptWithImages,
checkProtocolVersion, enforceProtocolVersionOrExit, summarizeTaskRunOutput.

## Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
empty admin lists = nobody ADMIN; missing token clean exit; no ProcessManager;
secrets out of repo; discord-post-message dangerous; thinking status edits one
progress message in-place; slash handlers re-check channel allowlist and
minPermission before acting; rate/mute refuse only the offending user;
outbound post with requesting_user_id verifies requester channel perms;
image attachments MIME-allowlisted (jpeg/png/gif/webp) with 20MB/5 caps and
local files under /tmp/corvidinho-images; protocol mismatch hard-fails start,
unverifiable soft-continues; `.ts` bins always bun-invoked for protocol and agent spawn;
Discord replies prefer parsed `task run --json` summaries.

## Behavioral Examples

Mention→start_session; reply/thread→continue_session; slash /session|/status|
/agents|/work on allowlisted channel; admin /mute|/unmute; non-admin mute
refused; rate-limited or muted user refused while peer continues;
discord-post-message with requester who cannot send → refuse; missing token /
empty channels refuse cleanly; session run posts progress then Done;
attached images land as local paths in the agent prompt; protocol version
match proceeds, mismatch refuses start.

## Error Cases

Missing token; empty channels; protocol mismatch; not authorized (message,
slash, or insufficient permission); muted; rate limited; requester cannot send;
strict missing requesting_user_id; SAFE-1 deny for discord-post; agent failure
marks progress error then reports; unknown slash command refused; oversized/unsupported image attachments skipped.

## Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

## Change Log

DISCORD-7 admin re-auth + DISCORD-8 confused-deputy (2026-09-26, corvid-agent + Merlin, #13).
DISCORD-9 image attachments + DISCORD-10 protocol lockstep (2026-09-26, corvid-agent image-attachments + Merlin protocol-version, #14).
| 2026-09-26 | hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version: HEAR image attachments + protocol lockstep (DISCORD-9,10) — steal image-attachments from corvid-agent + Merlin protocol-version; fixture tests; no ProcessManager; STATUS Done for #14 |
| 2026-09-26 | fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord: bun-invoke .ts for protocol+spawn; parse task run --json for Discord summary |
