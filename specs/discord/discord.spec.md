---
module: discord
version: 49
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol-version.ts
  - src/discord/image-attachments.ts
  - src/discord/memory-inject.ts
  - tests/discord.memory-inject.test.ts
  - src/discord/permissions.ts
  - src/discord/session-store.ts
  - src/store/db.ts
  - src/store/index.ts
  - src/store/paths.ts
  - src/store/session-ttl.ts
  - src/store/scrub.ts
  - tests/store.scrub.test.ts
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
  - src/discord/command-handlers/announce.ts
  - src/discord/announce-store.ts
  - src/discord/announce.ts
  - tests/discord.announce.test.ts
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

HEAR Discord bridge also auto-recalls MEMORY for the acting Discord user on
spawn and prepends an inject block to the agent prompt (AGENT-7 / MEMORY-2/4 /
REQ-discord-023) and `/announce` ops channel (DISCORD-ANNOUNCE-1..6 / REQ-discord-024), alongside image attachments, schedule, presence, and
session worktrees.

## Public API

Export `AnnounceStore` / `postAnnouncement` / `formatBridgeLiveAnnouncement` and `enrichPromptWithMemories`, `formatMemoryInjectBlock`, and related
constants/types from `src/discord/memory-inject.ts` (also re-exported via
`src/discord/index.ts`).

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
When `memoryStore` is available on the bridge, every routed chat spawn SHALL
recall for `msg.authorId` (limit ~20) and prepend the inject block before
`agent.runChat`. Empty recall still prepends the empty one-liner. Missing store
or blank author id leaves the prompt unchanged. Bridge logs inject count.
No `/memory` slash command.

## Behavioral Examples

### Scenario: Spawn with seeded identity

- **Given** a MemoryStore row `person/identity` for Discord user U
- **When** U sends a chat message the bridge routes to the agent
- **Then** the agent prompt starts with the Corvidinho memory header and a
  `- person/identity: …` bullet, and the bridge logs a non-zero inject count

### Scenario: Empty owner scope

- **Given** no memories for user U
- **When** U chats
- **Then** the prompt still includes the empty-memory one-liner nudging
  `memory-store`

## Error Cases

| Condition | Behavior |
|-----------|----------|
| memoryStore undefined | Prompt unchanged; no inject log |
| Blank author id | Prompt unchanged; no inject |

## Dependencies

- MEMORY store (`src/memory`) / REQ-discord-021
- Agent spawn client (`agent-client.ts`)

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
| 2026-09-26 | memory-discord-inject: auto-recall prepend on spawn (REQ-discord-023 / AGENT-7 / MEMORY-2/4); package 0.0.7 |
| 2026-09-26 | discord-memory-auto-recall-inject-on-spawn-plus-system-prompt-store-recall-rules-agent-7-memory-2-4-draft-67-behavior: Discord MEMORY auto-recall inject on spawn plus system-prompt store/recall rules (AGENT-7 MEMORY-2/4 draft #67 behavior) package 0.0.7 |
| 2026-09-26 | harden-memory-plugin-acl-memory-acl-1-4-safe-4-issue-59-follow-up-acting-discord-user-and-admin-come-only-from-bridge: Harden memory plugin ACL (MEMORY-ACL-1..4 / SAFE-4 / issue #59 follow-up): acting Discord user and ADMIN come only from bridge-set env never model argv (--user/--admin/--db refused); ADMIN re-checked at handler time against live admin config with empty=deny-all; include-deleted is ADMIN-only; forget/override become real two-phase with an HMAC confirm token confirmed from a different turn; Discord/WATCH spawns always overwrite acting env |
| 2026-09-26 | safe-6-secret-scrub-before-persist-automatic-re-scrub-issue-66-captured-slice-scrub-vendor-key-looking-secrets-github: SAFE-6 secret scrub before persist + automatic re-scrub (issue #66 captured slice): scrub vendor-key-looking secrets (GitHub, OpenAI-compatible, Anthropic, Discord bot, Slack, AWS, Google, JWT, bearer, private-key blocks) on every SQLite write path (sessions, work tasks, schedules + runs, memories) and re-scrub existing rows automatically when the scrub rules version increases; no new CLI or slash surface; draft SAFE-10 outbound/Discord-admin re-scrub and Algorand mnemonics left for HI capture |
| 2026-09-26 | discord-announce-slash: DISCORD-ANNOUNCE-1..6 `/announce` + REQ-discord-024; package 0.0.8 |
| 2026-09-26 | discord-announce-slash-discord-announce-1-6-channel-picker-persist-bridge-live-announce-only-package-0-0-8-req-discord: Discord /announce slash DISCORD-ANNOUNCE-1..6 CHANNEL picker persist bridge-live announce-only package 0.0.8 REQ-discord-024 |
| 2026-09-26 | discord-call-sites-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-come-only-from-what-the: Discord call sites pass the raw human message as humanText so SAFE-4 memory confirm tokens come only from what the human typed (PR #128, after #131 memory inject) |
| 2026-09-26 | restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or: Restart recovery for /work tasks (issue #87 captured slice, SESSION-WORKTREE-3): on bridge start, work tasks left queued or running by a dead process are marked failed with an honest summary and their abandoned talk is ended (worktree parked, session dropped) so /status never shows ghost running work and no later talk reuses the stale cwd; durable queue, repo locks and resume stay draft AUTONOMOUS-14 |
