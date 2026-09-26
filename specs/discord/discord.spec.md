---
module: discord
version: 42
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol-version.ts
  - src/discord/image-attachments.ts
  - src/discord/permissions.ts
  - src/discord/session-store.ts
  - src/store/db.ts
  - src/store/index.ts
  - src/store/paths.ts
  - src/store/session-ttl.ts
  - src/worktree/index.ts
  - src/worktree/manager.ts
  - src/worktree/cleanup.ts
  - tests/worktree.test.ts
  - tests/discord.session-worktree.test.ts
  - src/memory/types.ts
  - src/memory/store.ts
  - src/memory/index.ts
  - tests/memory.store.test.ts
  - tests/memory.spawn-env.test.ts
  - src/discord/work-store.ts
  - src/discord/message-router.ts
  - src/discord/agent-client.ts
  - src/discord/gateway.ts
  - src/discord/presence.ts
  - src/discord/bridge.ts
  - src/discord/thinking-status.ts
  - src/discord/slash-commands.ts
  - src/discord/register-commands.ts
  - src/discord/slash-types.ts
  - src/discord/slash-dispatch.ts
  - src/discord/command-handlers/session.ts
  - src/discord/command-handlers/status.ts
  - src/discord/command-handlers/agents.ts
  - src/discord/command-handlers/work.ts
  - src/discord/command-handlers/mute.ts
  - src/discord/command-handlers/schedule.ts
  - src/scheduler/cron.ts
  - src/scheduler/store.ts
  - src/scheduler/service.ts
  - src/scheduler/index.ts
  - tests/discord.schedule.test.ts
  - tests/scheduler.cron.test.ts
  - tests/scheduler.service.test.ts
  - src/discord/requester-perms.ts
  - src/discord/index.ts
  - plugins/discord/index.ts
  - tests/discord.protocol-version.test.ts
  - tests/discord.presence.test.ts

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
protocol-version lockstep, presence version under the bot name, allowlist deny polish (DISCORD-1/2/2.a/3/4/5/6/7/8/9/10/12/DENY-1..3), Discord `/schedule` recurring single-project runs with a cooperative ticker (DISCORD-SCHEDULE-1..5), local SQLite MEMORY with per-user ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / REQ-discord-021), and per-talk/project git worktree isolation (SESSION-WORKTREE-1..5 / REQ-discord-022).

## Public API

loadBridgeConfig, startBridge, routeMessage, SessionStore, WorkStore,
shared store helpers (resolveDataDir, openCorvidinhoDb, resolveSessionTtlMs; src/store/), MemoryStore (src/memory/),
goLiveChecklist, CORVIDINHO_PROTOCOL_VERSION, NOT_AUTHORIZED, ALLOWLIST_DENY_TIP, EPHEMERAL_SILENT_ACK, RATE_LIMITED,
MUTED, PermissionLevel, resolvePermissionLevel, checkRateLimit, muteUser,
unmuteUser, isMuted, evaluateRequesterCanSend, agent/gateway helpers,
thinking-status builders/controller, slash command bodies + dispatch
(handleSlashInteraction, buildSlashCommandBodies including mute/unmute/schedule, registerSlashCommandSet / registerSlashCommandsLive);
ScheduleStore / SchedulerService / validateAndResolveCadence (src/scheduler/);
worktree manager ensureTalkWorkspace/createWorktree/parkWorktree/resolveProjectDir (src/worktree/);
loadDiscordPlugins registers discord-post-message (requester check);
isImageAttachment, extractImageBlocks, enrichPromptWithImages,
checkProtocolVersion, enforceProtocolVersionOrExit, summarizeTaskRunOutput;
buildVersionPresenceActivity / formatPresenceVersionString (DISCORD-12).

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
Discord replies prefer parsed `task run --json` summaries;
slash registration with guild id PUTs guild commands then clears globals;
ClientReady sets short Custom Status from shared package version (DISCORD-12);
outside allowlist MessageCreate is silent and slash is ephemeral tip (admin) or zero-width ack (non-admin) — never public not-authorized (DISCORD-DENY-1..3);
SessionStore/WorkStore MAY persist via shared store SQLite under ~/.local/share/corvidinho with soft TTL ~45m (SESSION-1..4 / REQ-discord-019);
`/schedule` list|create|pause|resume|delete with ADMIN mutations, 5m min cadence, schedules in shared SQLite, cooperative ~60s ticker that must not starve HEAR/WATCH ingress (DISCORD-SCHEDULE-1..5 / REQ-discord-020);
memories in shared SQLite schema v3 scoped by Discord owner_user_id; ADMIN-only forget/override incl. self-forget; empty admin deny-all; no `/memory` slash (MEMORY-1..4 / MEMORY-ACL-1..5 / REQ-discord-021); Discord agent spawn always overwrites `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty when no actor) and `CORVIDINHO_ACTING_IS_ADMIN` so no run inherits an actor from the bridge env;
per-talk/project git worktrees (or scoped dirs) under `.corvid-worktrees`/`WORKTREE_BASE_DIR` with schema v4 session columns; end/TTL parks worktree; project never silent mid-talk switch; schedule ticks use project scope (SESSION-WORKTREE-1..5 / REQ-discord-022); package 0.0.5.

## Behavioral Examples

Mention→start_session; reply/thread→continue_session; slash /session|/status|
/agents|/work|/schedule on allowlisted channel; admin /mute|/unmute and /schedule mutations; non-admin mute
refused; rate-limited or muted user refused while peer continues;
discord-post-message with requester who cannot send → refuse; missing token /
empty channels refuse cleanly; session run posts progress then Done;
attached images land as local paths in the agent prompt; protocol version
match proceeds, mismatch refuses start; ClientReady sets presence to vX.Y.Z.

## Error Cases

Missing token; empty channels; protocol mismatch; channel deny silent/ephemeral (DISCORD-DENY); not authorized (insufficient
permission); muted; rate limited; requester cannot send;
strict missing requesting_user_id; SAFE-1 deny for discord-post; agent failure
marks progress error then reports; unknown slash command refused; oversized/unsupported image attachments skipped.

## Dependencies

src/allowlist/, agent task --no-verify, optional discord.js.

## Change Log

DISCORD-7 admin re-auth + DISCORD-8 confused-deputy (2026-09-26, corvid-agent + Merlin, #13).
DISCORD-9 image attachments + DISCORD-10 protocol lockstep (2026-09-26, corvid-agent image-attachments + Merlin protocol-version, #14).
| 2026-09-26 | hear-image-attachments-protocol-lockstep-discord-9-10-steal-image-attachments-from-corvid-agent-merlin-protocol-version: HEAR image attachments + protocol lockstep (DISCORD-9,10) — steal image-attachments from corvid-agent + Merlin protocol-version; fixture tests; no ProcessManager; STATUS Done for #14 |
| 2026-09-26 | fix-discord-watch-spawn-always-bun-invoke-ts-for-protocol-handshake-and-agent-client-parse-task-run-json-for-discord: bun-invoke .ts for protocol+spawn; parse task run --json for Discord summary |
| 2026-09-26 | bump-corvidinho-to-0-0-2-shared-version-helper-from-package-json-for-cli-and-discord-bridge-status-enrich-ephemeral: Bump Corvidinho to 0.0.2; shared version helper from package.json for CLI and Discord bridge /status; enrich ephemeral /status with uptime protocol channels sessions work LLM model+host (no key) slash command names optional git tip SHA; STATUS dogfood polish note; no new slash commands |
| 2026-09-26 | clean-re-register-discord-slash-set-discord-4-guild-rest-put-overwrite-of-only-the-six-current-commands-clear-global: guild PUT of six + clear globals (REQ-discord-016); discord register-commands CLI |
| 2026-09-26 | discord-bot-presence-shows-shared-corvidinho-package-version-discord-12-set-custom-status-on-clientready-from-src: Discord presence/custom status shows shared package version on ClientReady (DISCORD-12); fixture test; no slash/allowlist churn |

| 2026-09-26 | discord-deny-polish-discord-deny-1-3-messagecreate-unauthorized-silent-slash-admin-ephemeral-allowlist-tip-non-admin: DISCORD-DENY-1..3 silent MessageCreate + slash admin tip / non-admin zero-width; docs/discord.md |
| 2026-09-26 | session-durable-store: Discord SessionStore/WorkStore SQLite durability + soft TTL (SESSION-1..4 / REQ-discord-019); shared store module; no MEMORY ACL /schedule |
| 2026-09-26 | session-durable-store-discord-sessionstore-workstore-survive-restarts-via-local-sqlite-under-local-share-corvidinho: SESSION durable store: Discord SessionStore (+ WorkStore) survive restarts via local SQLite under ~/.local/share/corvidinho/ (align MEMORY #41 path); soft TTL 30-60m keep-alive on activity; idle/stale → fresh session (SESSION-1..4); no ProcessManager; no /schedule; no MEMORY ACL |
| 2026-09-26 | discord-schedule-slash-for-recurring-single-project-agent-runs-discord-schedule-1-5-issue-57-list-create-pause-resume: Discord /schedule slash for recurring single-project agent runs (DISCORD-SCHEDULE-1..5 / issue #57): list create pause resume delete; admin mutations; 5m min interval; steal corvid-agent schedule-commands + scheduler; ticks must not starve HEAR/WATCH ingress; no flock/council/templates/on-chain |
| 2026-09-26 | memory-sqlite-acl-memory-1-4-memory-acl-1-5-issues-41-59-shared-store-schema-v3-memories-scoped-by-discord-owner-user: MEMORY SQLite + ACL (MEMORY-1..4 / MEMORY-ACL-1..5 / issues #41 #59): shared store schema v3 memories scoped by Discord owner_user_id; categories conversation/entity/person/personality; ADMIN-only forget/override including self-forget; empty admin deny-all; no slash commands; no on-chain; bump 0.0.4 |
| 2026-09-26 | session-worktree-per-talk-project-git-worktree-isolation-session-worktree-1-5-issue-58-package-v0-0-5-discord-cli-talks: SESSION-WORKTREE per-talk/project git worktree isolation (SESSION-WORKTREE-1..5 / issue #58) + package v0.0.5 |
