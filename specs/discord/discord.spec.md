---
module: discord
version: 57
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol-version.ts
  - src/discord/image-attachments.ts
  - src/discord/memory-inject.ts
  - tests/discord.memory-inject.test.ts
  - src/discord/identity-inject.ts
  - tests/discord.identity-inject.test.ts
  - src/discord/permissions.ts
  - src/identity/owner.ts
  - src/identity/index.ts
  - tests/identity.owner.test.ts
  - tests/discord.owner.test.ts
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
  - src/work/pr.ts
  - src/work/pr-body.ts
  - tests/work.pr.test.ts
  - src/discord/command-handlers/mute.ts
  - src/discord/command-handlers/schedule.ts
  - src/discord/command-handlers/announce.ts
  - src/discord/command-handlers/admin.ts
  - src/discord/admin-allowlist.ts
  - src/discord/channel-autocomplete.ts
  - tests/discord.admin-slash.test.ts
  - tests/discord.channel-autocomplete.test.ts
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
session worktrees. Owner-only `/admin` edits the Discord user/channel
allowlists at runtime (ADMIN-1..4 / REQ-discord-043); channel options use
STRING + autocomplete (searchable name/id) instead of the native CHANNEL picker.

## Public API

`identity-inject.ts` formats/enriches the spawn prompt with acting Discord
user id + resolved display (owner map wins for owner). Gateway fills
`authorDisplayName` / `authorUsername` (and slash `userDisplayName` /
`userUsername`). Bridge and slash handlers inject identity before memory.

`ThinkingStatus` accepts optional `model` and `plumbing`; footer shows model
and, on done/error, plumbing (`state`/`verified`/`verifySkipped`/`attempts`).
Final chat reply content remains human text only (DISCORD-3.a).

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
`/admin` users add | channels add|remove | config show is owner-only with a dispatcher ADMIN floor plus a handler re-check, writes only `[discord].users` / `[discord].channels` of the allowlist file the bridge loaded (atomic temp+rename, other lines kept), updates the live allowlist in place without restart, never writes env values, refuses deny-listed ids, env-only removals and removing the last live channel (a channel also on `deny_channels` does not count as live), warns when the first user narrows STANDARD→BLOCKED, and appends SAFE-5 audit rows (fail closed) (ADMIN-1..4 / REQ-discord-043);
`/schedule` list|create|pause|resume|delete with ADMIN mutations, 5m min cadence, schedules in shared SQLite, cooperative ~60s ticker that must not starve HEAR/WATCH ingress (DISCORD-SCHEDULE-1..5 / REQ-discord-020);
memories in shared SQLite schema v3 scoped by Discord owner_user_id; ADMIN-only forget/override incl. self-forget; empty admin deny-all; no `/memory` slash (MEMORY-1..4 / MEMORY-ACL-1..5 / REQ-discord-021); Discord agent spawn always overwrites `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty when no actor) and `CORVIDINHO_ACTING_IS_ADMIN` so no run inherits an actor from the bridge env;
per-talk/project git worktrees (or scoped dirs) under `.corvid-worktrees`/`WORKTREE_BASE_DIR` with schema v4 session columns; end/TTL parks worktree; project never silent mid-talk switch; schedule ticks use project scope (SESSION-WORKTREE-1..5 / REQ-discord-022); package 0.0.5.
`/work` opens a draft PR only from a verified git worktree with changes, only when `git-commit` (dirty tree), `git-push` and `github-pr-create` are all allowlisted for non-interactive use, and only through those typed plugins; otherwise its reply says plainly why no PR (AUTONOMOUS-3 / GITHUB-2/5/6 / AGENT-4 / REQ-discord-088).
Schedule ticks are safe with a bridge and `corvidinho daemon` on one data dir: each tick `refresh()`es the schedules table, `claimRun()` compare-and-sets a due run so it fires once, and store updates write only their own columns so a finishing run never undoes a pause/resume made elsewhere; each run outcome is recorded once (`onRunFinished`, `drain`, `abandonInFlight` for shutdown) (CLI-8 / AUTONOMOUS-4 / REQ-discord-108).
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

### Scenario: Owner approves the first user at runtime

- **Given** an allowlist file with `[discord] users = []`, `roles = []`, an
  `[owner]` section, and the owner invoking from an allowlisted channel
- **When** the owner runs `/admin users add user:@U`
- **Then** only the `users` line becomes `users = ["U"]` (other lines kept),
  the live allowlist holds U without a restart, the ephemeral reply shows
  before/after counts and warns that unlisted callers now resolve to BLOCKED,
  and the audit chain gains `started` + `ok` rows

## Error Cases

| Condition | Behavior |
|-----------|----------|
| memoryStore undefined | Prompt unchanged; no inject log |
| Blank author id | Prompt unchanged; no inject |
| `/admin` by non-owner / no owner | Ephemeral `not authorized`; no file write |
| `/admin` on unreadable/unparsable file | Ephemeral refusal naming the path; file untouched |
| `/admin` audit trail unavailable | Ephemeral refusal (SAFE-5 fail closed); nothing changed |

## Dependencies

- MEMORY store (`src/memory`) / REQ-discord-021
- Agent spawn client (`agent-client.ts`)

## Change Log

| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: IDENTITY-4 inject; DISCORD-3.a model+plumbing in thinking footer; clean chat body |
| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: Dogfood UX: Discord identity inject (IDENTITY-4), thinking embed model+plumbing (DISCORD-3.a), clean chat replies, community public GitHub gate (ROLES-CHAT-8); package 0.0.18 |
