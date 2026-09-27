---
module: discord
version: 68
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
  - tests/worktree.project-scope.test.ts
  - src/memory/types.ts
  - src/memory/store.ts
  - src/memory/index.ts
  - tests/memory.store.test.ts
  - tests/memory.spawn-env.test.ts
  - src/discord/work-store.ts
  - src/discord/message-router.ts
  - tests/discord.actor-gate.test.ts
  - src/discord/agent-client.ts
  - src/discord/gateway.ts
  - src/discord/presence.ts
  - src/discord/bridge.ts
  - src/discord/thinking-status.ts
  - src/discord/slash-finish.ts
  - src/discord/slash-commands.ts
  - src/discord/register-commands.ts
  - src/discord/slash-types.ts
  - src/discord/slash-dispatch.ts
  - src/discord/command-handlers/session.ts
  - tests/discord.slash-ask7.test.ts
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
  - tests/scheduler.worktree.test.ts
  - tests/scheduler.tick-errors.test.ts
  - src/discord/requester-perms.ts
  - src/discord/index.ts
  - plugins/discord/index.ts
  - tests/discord.protocol-version.test.ts
  - tests/discord.presence.test.ts
  - src/discord/ask-ping.ts
  - src/discord/spend-post.ts
  - tests/discord.spend.test.ts
  - tests/discord.ask-ping.test.ts
  - src/discord/thin-ack.ts
  - tests/discord.thin-ack.test.ts
  - src/discord/ask-buttons.ts
  - src/agent/ask-options.ts
  - tests/discord.ask-buttons.test.ts
  - tests/discord.ask-ephemeral.test.ts
  - src/discord/inflight-replies.ts
  - tests/discord.inflight-replies.test.ts

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

Export `AnnounceStore` / `postAnnouncement` / `formatBridgeLiveAnnouncement` and `enrichPromptWithMemories`, `formatMemoryInjectBlock`, and related
constants/types from `src/discord/memory-inject.ts` (also re-exported via
`src/discord/index.ts`). `/admin`: `handleAdminCommand`, `formatConfigShow`,
`ADMIN_AUDIT_SURFACE` (`command-handlers/admin.ts`); `planAdminListChange`,
`commitAdminListChange`, `resolveAdminAllowlistPath`, `setTomlDiscordList`,
`setJsonDiscordList`, `writeFileAtomic`, `allowlistFileFormat` (the loader's
`isJsonAllowlistPath` rule), `danglingSymlinkError` (`admin-allowlist.ts`);
`flattenSlashOptions` (`gateway.ts`); `buildChannelAutocompleteChoices` / `matchChannels` / `resolveChannelOption` (`channel-autocomplete.ts`); `SlashInteraction.subcommandGroup` and
`SlashContext.recordAudit`.

Questions and owner/requester ping (REQ-discord-044, issue #44, AUTONOMY-1/2/4..6 /
DISCORD-ASK / SESSION-MULTI): `src/discord/ask-ping.ts` exports `formatAskReply`,
`defangMassMentions`, `ASK_NO_OWNER_WARNING`, `ASK_REPLY_HINT`, `ASK_REPLY_MAX`.
Clarify mentions `requesterDiscordId`; stuck mentions the configured owner.
When an ask has structured options (or a numbered list in the question),
`src/discord/ask-buttons.ts` posts a public Choose stub (no MCQ body) and opens
an ephemeral button UI on press (`ASK_BUTTON_TTL_MS` ~30m; late press →
`ASK_CHOICE_EXPIRED`). Free-text clarify remains when options cannot be listed.
Thinking collapses into the Choose stub (DISCORD-ASK-6); done/pick and slash
`/session start` / `/work` prefer editing that message into the final answer
(DISCORD-ASK-7) via `ThinkingStatus.finalizeContent` (`finishSlashWithThinking`). After an ephemeral pick, buttons clear and the Got-it ephemeral is deleted when resume finishes (DISCORD-ASK-8).
`src/agent/ask-options.ts` exports `resolveAskOptions` / `parseChoicesFromQuestion`.
Gateway `reply` accepts optional `components`; `onComponent` handles button
custom ids. Sessions persist `pendingAsk` (with `askId` / `expiresAt` / options)
in `discord_sessions.pending_ask` (schema v8). Button pending asks are NOT
cleared by ordinary chat (SESSION-MULTI-3); free-text pending still clears on
substantive continue. Message router keys sessions by Discord user id + channel
(SESSION-MULTI-1); reply/thread continue only for the session owner.
`src/discord/thin-ack.ts` exports `isThinAck` / `isCancelAsk` / `ASK_CANCELLED_ACK`.
`/work` and `/session start` keep a clarify or stuck ask as their session's
free-text `pendingAsk` (options dropped: the slash answer has no Choose
buttons; never a `spend-cap` stop), and the bridge sets
`SlashContext.trackBotMessage` so the slash answer message continues its
session: a thin reply restates, cancel clears, a substantive reply resumes
with the question (AUTONOMY-1/5/6 / REQ-discord-044).

Daily spend cap on Discord (REQ-discord-098, issue #98, SAFE-8 as amended /
AUTONOMOUS-8): a `spend-cap` ask posts through `formatAskReply` with
`SPEND_CAP_HEADLINE` / `SPEND_CAP_STATUS` (paused, not an error) and the owner
pinged; `askPingKey` keys a `spend-cap` ask on its reason only, so a schedule
pings once per cap episode. `ask-ping.ts` also exports
`formatSpendWarningReply`, `withSpendWarningPost` and `appendPostLine`:
`AgentSpawnResult` gains optional `spendWarning` (amounts validated from the
`result` frame by `spendWarningFromUnknown`), and the bridge reply and the
schedule post append the 80% warning line with the owner added to
`mentionUserIds`. `SlashContext.spendLine` / `StatusReportInput.spendLine`
carry `/status`'s 24 h spend vs cap line (`formatSpendStatusLine` over
`readSpendSnapshot` on the bridge's shared DB); no new slash command.
The bridge builds one `createSpendAlertOutbox({ db, env })`
(`src/agent/spend-outbox.ts`) and shares it as `SlashContext.spendAlerts` and
`SchedulerServiceOpts.spendAlerts`; `SlashContext.post` is the gateway reply
(a fresh channel post). `src/discord/spend-post.ts` exports `askPingOwner`
(a `spend-cap` ask pings once per cap episode via `claimCapPing`; its
`release` hands the ping back when the post fails), `askNeedsOwner` (stuck
and spend-cap ping the owner; clarify addresses the requester, AUTONOMY-4),
`takeSpendWarning`, `ownerAskNoticeLine`, `slashOwnerNotice`,
`finishSlashWithOwnerNotice`, and the `ChannelPost` / `OwnerNotice` /
`AskPingOwner` types. The chat reply (also the reply to a run a button pick
resumed; a spend-cap stop never gets choice buttons; the warning line and
owner mention ride the collapsed edit of the thinking message, DISCORD-ASK-6/7,
or the fallback reply, and go back when neither went out), `/work`,
`/session start` and the schedule post take the pending warning from the outbox (the run's own
`spendWarning` only when there is no DB), and hand it and the cap ping back
when the post does not go out (`SchedulerOutbound.post` may resolve `false`;
a schedule then keeps no ping key). `OwnerNotice.release` hands back what a
slash notice claimed; `finishSlashWithOwnerNotice` answers through
`finishSlashWithThinking` (DISCORD-ASK-7: the thinking message collapsed into
the answer, else the ask/Done/fail status plus the reply; its `askStatus`
keeps an ask run from showing "✅ Done", `mentionUserIds` limits the
collapsed answer's mentions and `onDelivered` reports the answer went out),
then posts the notice fresh (an edit does not notify), appends it to the
answer when that post fails, still posts it when the answer itself fails
(expired interaction token) and re-raises that error. A `spend-cap` stop is never the session's `pendingAsk` (a reply cannot
lift the cap), and a stored one loads as none. `/work` and
`/session start` post `result.ask` through `formatAskReply` (paused status,
not ✅; a clarify ask addresses the requester); `WorkTaskStatus` gains
`blocked` (listed on `/status` as waiting for input when > 0); the owner
ping (stuck and spend-cap only) and the warning go out as a fresh post after
the answer. `formatAskReply` pings the owner for a `spend-cap` ask like a
stuck one. `formatAskReply` ignores `replyHint` for a `spend-cap` ask.
`ScheduleRunFinished` gains optional `askReason` and `spendWarning`.

Interrupted replies (REQ-discord-311, DISCORD-3 / AGENT-3):
`src/discord/inflight-replies.ts` exports `InflightReplyStore` (`begin`,
`setProgressMessage`, `end`, `list` over `discord_inflight_replies`, schema
v9, `SCHEMA_VERSION` 9), `recoverInterruptedReplies`, `buildInterruptedEmbed`,
`INTERRUPTED_REPLY_TEXT` / `INTERRUPTED_REPLY_STATUS` and the `InflightReply`
/ `RecoverInterruptedRepliesOptions` / `RecoverInterruptedRepliesResult`
types (`mayPost` option, `skipped` count). The bridge records a row per
message reply and per button-pick run and clears it on every exit — at the
latest when the progress message is edited into the answer / Choose stub
(DISCORD-ASK-6/7) or the fallback reply is posted; a button pick's row points
at the Choose stub it reuses as progress; at start, after the gateway is up, it
marks each leftover reply interrupted where its channel (or thread parent) is
still allowlisted.

`src/work/pr.ts` exports `openWorkPr` (the /work → draft PR step, never
throws) with `WORK_PR_PLUGINS`, `OpenWorkPrInput`, `OpenWorkPrDeps` and
`WorkPrOutcome`; `src/work/pr-body.ts` exports `workPrTitle`,
`workCommitMessage` and `buildWorkPrBody` (REQ-discord-088).
`AgentSpawnResult.task` carries the run's verify facts from its result frame.
`WorkPrSkipReason` includes `needs-input`: a `blocked` /work run (it asked a
human) never ships a PR (REQ-discord-044).

`image-attachments.ts` exports `attachmentCacheDir(workDir)` and
`WORKSPACE_ATTACHMENTS_SUBDIR` (`.corvidinho/attachments`); the bridge binds the
worktree first, then passes `attachmentCacheDir(store.cwdFor(session))` as the
`enrichPromptWithImages` cache dir (REQ-discord-013, DISCORD-9).

`identity-inject.ts` formats/enriches the spawn prompt with acting Discord
user id + resolved display (owner map wins for owner). Gateway fills
`authorDisplayName` / `authorUsername` (and slash `userDisplayName` /
`userUsername`). Bridge and slash handlers inject identity before memory.

`ThinkingStatus` accepts optional `model` and `plumbing`; footer shows model
and, on done/error, plumbing (`state`/`verified`/`verifySkipped`/`attempts`).
Final chat reply content remains human text only (DISCORD-3.a).

`src/discord/permissions.ts` exports `gateActor` (the chat + slash actor gate:
deny lists win, non-empty user/role allowlist must match or be the owner);
`RouterDeps.owner` passes the configured owner to `routeMessage`
(REQ-discord-201).

## Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
empty admin lists = nobody ADMIN; missing token clean exit; no ProcessManager;
secrets out of repo; discord-post-message dangerous; thinking status edits one
progress message in-place; slash handlers re-check channel allowlist and
minPermission before acting; rate/mute refuse only the offending user;
outbound post with requesting_user_id verifies requester channel perms;
image attachments MIME-allowlisted (jpeg/png/gif/webp) with 20MB/5 caps and
local files inside the session workspace (`<cwd>/.corvidinho/attachments/`,
git-ignored, removed with the workspace on session end) so the agent's
file tools can open them (REQ-discord-013); protocol mismatch hard-fails start,
unverifiable soft-continues; `.ts` bins always bun-invoked for protocol and agent spawn;
Discord replies prefer parsed `task run --json` summaries;
slash registration with guild id PUTs guild commands then clears globals;
ClientReady sets short Custom Status from shared package version (DISCORD-12);
outside allowlist MessageCreate is silent and slash is ephemeral tip (admin) or zero-width ack (non-admin) — never public not-authorized (DISCORD-DENY-1..3);
every @mention/reply/thread message and every slash command also passes `gateActor` after the channel gate: deny-listed users/roles are refused, and when the user or role allowlist is non-empty only listed users, allowed roles or the owner pass; empty user+role lists keep the channel-only path; refusal is silent on MessageCreate and a zero-width ephemeral ack on slash (ALLOW-3/5 / DISCORD-5 / DISCORD-DENY-1..3 / REQ-discord-201);
SessionStore/WorkStore MAY persist via shared store SQLite under ~/.local/share/corvidinho with soft TTL ~45m (SESSION-1..4 / REQ-discord-019);
`/admin` users add | channels add|remove | config show is owner-only with a dispatcher ADMIN floor plus a handler re-check, writes only `[discord].users` / `[discord].channels` of the allowlist file the bridge loaded (atomic temp+rename, other lines kept), updates the live allowlist in place without restart, never writes env values, refuses deny-listed ids, env-only removals and removing the last live channel (a channel also on `deny_channels` does not count as live), warns when the first user narrows STANDARD→BLOCKED, and appends SAFE-5 audit rows (fail closed) (ADMIN-1..4 / REQ-discord-043);
`/schedule` list|create|pause|resume|delete with ADMIN mutations, 5m min cadence, schedules in shared SQLite, cooperative ~60s ticker that must not starve HEAR/WATCH ingress (DISCORD-SCHEDULE-1..5 / REQ-discord-020);
memories in shared SQLite schema v3 scoped by Discord owner_user_id; ADMIN-only forget/override incl. self-forget; empty admin deny-all; no `/memory` slash (MEMORY-1..4 / MEMORY-ACL-1..5 / REQ-discord-021); Discord agent spawn always overwrites `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty when no actor) and `CORVIDINHO_ACTING_IS_ADMIN` so no run inherits an actor from the bridge env;
a message reply or button-pick run keeps one `discord_inflight_replies` row (ids incl. a thread's allowlisted parent channel + start time, no text) from before its progress embed is sent until it finishes, cleared on every exit path (including the moment the progress message is collapsed into the answer or Choose stub, DISCORD-ASK-6/7); the next bridge start edits each leftover row's own progress embed to the red failed status `interrupted: Corvidinho restarted before this reply finished — please send it again`, or replies to the recorded request message in the same channel when there is no embed id or the edit fails, then deletes the row — only while the row's channel or parent is still allowlisted (DISCORD-5), sequential, best effort, never throws out of startup, nothing posted when no rows (DISCORD-3 / AGENT-3 / REQ-discord-311);
per-talk/project git worktrees (or scoped dirs) under `.corvid-worktrees`/`WORKTREE_BASE_DIR` with schema v4 session columns; end/TTL parks worktree; project never silent mid-talk switch; schedule ticks use project scope (SESSION-WORKTREE-1..5 / REQ-discord-022); package 0.0.5.
`/work` opens a draft PR only from a verified git worktree with changes, only when `git-commit` (dirty tree), `git-push` and `github-pr-create` are all allowlisted for non-interactive use, and only through those typed plugins; otherwise its reply says plainly why no PR (AUTONOMOUS-3 / GITHUB-2/5/6 / AGENT-4 / REQ-discord-088).
Schedule ticks are safe with a bridge and `corvidinho daemon` on one data dir: each tick `refresh()`es the schedules table, `claimRun()` compare-and-sets a due run so it fires once, and store updates write only their own columns so a finishing run never undoes a pause/resume made elsewhere; each run outcome is recorded once (`onRunFinished`, `drain`, `abandonInFlight` for shutdown) and an abandoned run's spawned agent is killed with its whole process tree through `AgentRunChatOpts.signal` (the spawn client runs each agent in its own process group, AGENT-3) (CLI-8 / AUTONOMOUS-4 / REQ-discord-108).
When `memoryStore` is available on the bridge, every routed chat spawn SHALL
recall for `msg.authorId` (limit ~20) and prepend the inject block before
`agent.runChat`. Empty recall still prepends the empty one-liner. Missing store
or blank author id leaves the prompt unchanged. Bridge logs inject count.
No `/memory` slash command.
Module-owned tables in the shared DB (e.g. `spend_ledger` and `spend_alerts`
from `src/agent/spend.ts`, REQ-discord-098) are created with CREATE TABLE IF
NOT EXISTS without a schema version bump, and their free-text columns are
scrubbed on write and listed in `SCRUB_TARGETS` (SAFE-6); `spend_alerts` has
no free-text column (a constant kind and integers).
The spend warning line and `/status` spend line are built from integer
amounts, never from child-written text; the spend-cap question is scrubbed and
mention-defanged like every ask.
Recording a SAFE-8 warning and delivering it are separate: whichever process
crossed 80% records it, and the bridge delivers it on its next post to any
allowlisted channel it already posts in (no new channel, no DM), claiming it
in one IMMEDIATE transaction so two posts never repeat it. A spend-cap ask
never carries the "reply to answer" hint (a reply cannot lift the cap); it
pings the owner once per cap episode across chat, slash commands and
schedules. A slash run's owner ping is a fresh post (an edit of a deferred
reply may not notify), with allowed mentions limited to the owner.
A `/work` or `/session start` run that stopped to ask leaves its session
waiting on that ask exactly like a chat ask (free text, never a spend-cap
stop), and its answer message is tracked like a chat reply, so a reply to it
by the requester never goes unheard (AUTONOMY-1/5/6 / REQ-discord-044).

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
| Leftover in-flight reply, embed edit fails or no embed id | Reply to the request message with the interrupted text; row deleted |
| Leftover in-flight reply, edit and reply both fail | Logged as unreachable; row deleted; bridge start continues |
| Leftover in-flight reply in a channel no longer allowlisted | Nothing edited or posted; logged as skipped; row deleted |
| In-flight row write fails (DB busy) | Warning logged; the reply itself still runs |

## Dependencies

- MEMORY store (`src/memory`) / REQ-discord-021
- Agent spawn client (`agent-client.ts`)

## Change Log

DISCORD-7 admin re-auth + DISCORD-8 confused-deputy (2026-09-26, corvid-agent + Merlin, #13).
DISCORD-9 image attachments + DISCORD-10 protocol lockstep (2026-09-26, corvid-agent image-attachments + Merlin protocol-version, #14).
| 2026-09-26 | dogfood-ux-discord-identity-inject-identity-4-thinking-embed-model-plumbing-discord-3-a-clean-chat-replies-community: IDENTITY-4 inject; DISCORD-3.a model+plumbing in thinking footer; clean chat body |
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
| 2026-09-26 | identity-durable-owner-record-issue-42-captured-slice-identity-1-identity-3-admin-4-allow-4-owner-discord-snowflake: IDENTITY durable owner record (issue #42 captured slice IDENTITY-1/IDENTITY-3 + ADMIN-4 + ALLOW-4): owner Discord snowflake plus optional GitHub login and display from bot-VM env CORVIDINHO_OWNER_* or allowlist file [owner] section (env overrides file); owner resolves to ADMIN at handler time unless deny-listed or muted; existing admin env lists unchanged; empty owner means no owner; ephemeral /status and doctor show owner configured yes/no plus display only; strict owner-only admin (IDENTITY-2) left for Leif |
| 2026-09-26 | discord-call-sites-pass-the-raw-human-message-as-humantext-so-safe-4-memory-confirm-tokens-come-only-from-what-the: Discord call sites pass the raw human message as humanText so SAFE-4 memory confirm tokens come only from what the human typed (PR #128, after #131 memory inject) |
| 2026-09-26 | restart-recovery-for-work-tasks-issue-87-captured-slice-session-worktree-3-on-bridge-start-work-tasks-left-queued-or: Restart recovery for /work tasks (issue #87 captured slice, SESSION-WORKTREE-3): on bridge start, work tasks left queued or running by a dead process are marked failed with an honest summary and their abandoned talk is ended (worktree parked, session dropped) so /status never shows ghost running work and no later talk reuses the stale cwd; durable queue, repo locks and resume stay draft AUTONOMOUS-14 |
| 2026-09-26 | safe-5-tamper-evident-audit-trail-issue-95-captured-slice-append-only-audit-log-schema-v5-update-delete-blocked-by: SAFE-5 tamper-evident audit trail (issue #95 captured slice): append-only audit_log (schema v5, UPDATE/DELETE blocked by triggers) with an HMAC-SHA256 chain keyed by CORVIDINHO_AUDIT_HMAC_KEY from the bot VM env (plain SHA-256 integrity chain when unset); runPlugin records every dangerous plugin run (started then ok/error, fail closed if the intent cannot be recorded) and denied close calls, storing action, actor, surface, args digest and outcome, never raw args; verify at bridge start and a chain-status line in /status; busy_timeout on the shared DB; tests isolate the data dir; draft SAFE-17 Discord verify command left for HI capture |
| 2026-09-26 | strict-identity-2-admin-is-owner-only-issue-42-leif-decision-admin-user-role-env-lists-no-longer-grant-admin-no-owner: Strict IDENTITY-2: ADMIN is owner-only (issue #42, Leif decision). Admin user/role env lists no longer grant ADMIN; no owner means nobody is ADMIN (IDENTITY-3); bridge and doctor warn when legacy admin lists are set |
| 2026-09-26 | discord-admin-announce-channel-string-autocomplete-searchable-name-id-admin-2-discord-announce-2-v0-0-16: Discord /admin channels add|remove + /announce channel STRING+autocomplete searchable by name/id (≤25); replaces limited CHANNEL picker; package 0.0.16 |
| 2026-09-26 | discord-admin-slash-for-runtime-allowlist-admin-issue-43-captured-admin-1-4-owner-only-admin-users-add-channels-add: Discord /admin slash for runtime allowlist admin (issue #43 captured ADMIN-1..4): owner-only /admin users add, channels add\|remove, config show; persists to the allowlist file the bridge already reads (atomic temp+rename, other sections and comments kept) and updates the live allowlist without restart; env values read-only at runtime; empty stays deny-all; SAFE-5 audit rows for mutations |
| 2026-09-26 | live-ndjson-event-stream-for-bridges-issue-73-agent-8-cli-7-discord-3-discord-10-task-run-output-ndjson-emits-one: Live NDJSON event stream for bridges (issue #73, AGENT-8 / CLI-7 / DISCORD-3 / DISCORD-10): task run --output ndjson emits one versioned JSON object per line for StateChanged/Text/ToolCall(redacted argument summary)/ToolResult/VerifyResult, running token usage, and a final result line; Discord and WATCH spawn clients consume the stream and forward state/tool/tokens to onStatus; protocol version 1 to 2 |
| 2026-09-26 | enrich-formatbridgeliveannouncement-with-5-changelog-bullets-for-discord-announce-4-standing-order-package-0-0-11: Enrich formatBridgeLiveAnnouncement with ≤5 CHANGELOG bullets for DISCORD-ANNOUNCE-4 standing order; package 0.0.11 |
| 2026-09-26 | watch-durable-sessionstore-issue-37-slice-1-session-1-3-watch-sessions-keyed-by-owner-repo-number-persist-in-the-shared: WATCH durable SessionStore (issue #37 slice 1, SESSION-1..3): WATCH sessions keyed by owner/repo#number persist in the shared SQLite DB (schema v6 watch_sessions) with the same soft TTL as Discord; activity keeps the session, idle past TTL starts fresh, sessions reload on restart; github watch opens the shared DB (in-memory for dry-run without a data dir and tests); topic scrubbed per SAFE-6; turn persistence/replay and summaries stay follow-ups |
| 2026-09-26 | safe-8-daily-spend-cap-issue-98-captured-slice-optional-corvidinho-daily-spend-cap-usd-caps-provider-llm-spend-over-a: SAFE-8 daily spend cap (issue #98 captured slice): optional CORVIDINHO_DAILY_SPEND_CAP_USD caps provider (LLM) spend over a rolling 24h; each OpenAI-compatible call is priced from a per-model table, reserved against a spend_ledger in the shared SQLite DB before it is sent and refused with a clear error when it would break the cap, then settled from provider-reported token usage; unpriced models are refused while a cap is set; no cap means no behavior change; doctor shows spend vs the cap (AUTONOMOUS-8); ledger provider/model columns are SAFE-6 scrubbed; draft SAFE-14..16 (80% warn, per-provider caps, ask at 100%) left for HI capture |
| 2026-09-26 | discord-and-watch-spawns-always-run-prove-before-done-agent-4-fledge-2-stop-passing-no-verify-empty-fileschanged-still: Discord and WATCH spawns always run prove-before-done (AGENT-4 / FLEDGE-2): stop passing --no-verify; empty filesChanged still skips verify; CLI --no-verify local opt-out only; package 0.0.13 (#85 slice) |
| 2026-09-26 | headless-schedule-daemon-issue-108-captured-slice-cli-8-autonomous-4-corvidinho-daemon-ticks-schedules-without-discord: Headless schedule daemon (issue #108 captured slice CLI-8 / AUTONOMOUS-4): corvidinho daemon ticks schedules without Discord, single-instance lock in the data dir, clean SIGTERM/SIGINT shutdown, JSON-line logs, systemd doc; schedule ticks claim each due run atomically in SQLite so a daemon and a bridge on one data dir never double-fire or clobber each other |
| 2026-09-26 | autonomy-1-2-ask-human-tool-and-stuck-owner-ping-on-discord-44: AUTONOMY-1/2 ask-human tool and stuck owner ping on Discord (#44) |
| 2026-09-26 | autonomy-4-7-clarify-pings-requester-thin-ack-restates-pending-ask-cancel-clears-joke-impossible-witty-decline-package: AUTONOMY-4..7 requester ping, thin-ack restate, cancel, joke decline |
| 2026-09-26 | github-pr-review-reads-issue-93-captured-slice-github-3-github-1-read-only-github-pr-diff-unified-diff-capped-at-200: GitHub PR review reads (issue #93 captured slice, GITHUB-3 / GITHUB-1): read-only github-pr-diff (unified diff capped at 200 KiB with a truncation marker, optional --file PATH filter) and github-pr-files (changed files with status/additions/deletions, paginated to a cap) in plugins/github/review.ts; dangerous false, minTier 0, GITHUB-6 repo gate; SAFE-6 scrub on returned text; diff returned as untrusted data; draft GITHUB-10 confidence score left for HI capture |
| 2026-09-26 | work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only: /work opens a draft PR from its verified worktree (issue 88, AUTONOMOUS-3, GITHUB-2, GITHUB-5, AGENT-4): after a /work run, only when git-commit, git-push and github-pr-create are allowlisted for non-interactive use, commit and push the talk branch and open a draft PR through the existing git and github plugins with a description built from the real diff and the verify result; otherwise reply plainly why no PR was opened |
| 2026-09-26 | work-ships-a-pr-only-for-admin-owner-per-roles-chat-3-and-only-from-the-work-branch-never-the-base-or-a-switched: /work ships a PR only for ADMIN (owner) per ROLES-CHAT-3, and only from the work branch (never the base or a switched/detached HEAD) |
| 2026-09-26 | discord-searchable-channel-string-autocomplete-for-admin-channels-add-remove-and-announce-channel-admin-2-ux-discord: Discord searchable channel STRING+autocomplete for /admin channels add\|remove and /announce channel (ADMIN-2 UX / DISCORD-ANNOUNCE-2 amend); replace limited native CHANNEL picker; package 0.0.17 |
| 2026-09-26 | safe-8-amended-issue-98-warn-at-80-of-the-daily-spend-cap-and-ask-at-100-instead-of-refusing-once-per-crossing-a-run: SAFE-8 amended (issue #98): warn at 80% of the daily spend cap and ask at 100% instead of refusing. Once per crossing a run that pushes rolling 24h spend to 80% of CORVIDINHO_DAILY_SPEND_CAP_USD emits a warning (Text event, result spendWarning, Discord reply line with owner ping); a provider call that would pass the cap is stopped before it is sent and the run ends blocked with a spend-cap ask to the owner via the AUTONOMY-1/2 ask path stating spend vs cap and how to continue; doctor and Discord /status show 24h spend vs the cap (AUTONOMOUS-8); Approve card (#96) left for HI capture |
| 2026-09-26 | soft-ttl-purge-never-parks-or-drops-a-discord-session-while-its-agent-run-is-in-flight-the-run-end-counts-as-activity: Soft-TTL purge never parks or drops a Discord session while its agent run is in flight; the run end counts as activity (SESSION-2, SESSION-WORKTREE-3) |
| 2026-09-26 | schedule-runs-name-worktrees-and-branches-from-the-full-schedule-and-run-ids-and-stale-branch-cleanup-parks-a-branch: Schedule runs name worktrees and branches from the full schedule and run ids, and stale-branch cleanup parks a branch with commits instead of deleting it (SESSION-WORKTREE-1/3, DISCORD-SCHEDULE-3) |
| 2026-09-26 | discord-chat-and-slash-paths-gate-the-actor-against-the-user-role-allowlist-and-deny-lists-not-the-channel-alone: Discord chat and slash paths gate the actor against the user/role allowlist and deny lists, not the channel alone |
| 2026-09-26 | discord-image-attachments-are-written-inside-the-session-workspace-so-the-agent-can-open-them-discord-9: Discord image attachments are written inside the session workspace so the agent can open them (DISCORD-9) |
| 2026-09-26 | discord-project-option-stays-inside-the-bridge-project-root-or-an-allowlisted-sibling-repo-checkout-allow-2-allow-6: Discord project option stays inside the bridge project root or an allowlisted sibling repo checkout (ALLOW-2, ALLOW-6, SAFE-3, DISCORD-SCHEDULE-3) |
| 2026-09-26 | cleanupemptybranch-never-force-deletes-a-branch-with-commits-when-the-default-branch-is-not-main-master: CleanupEmptyBranch never force-deletes a branch with commits when the default branch is not main/master |
| 2026-09-26 | harden-admin-and-github-pr-diff-edges-admin-mutations-fail-closed-when-no-audit-trail-is-wired-allowlist-json-toml: Harden /admin and github-pr-diff edges: /admin mutations fail closed when no audit trail is wired, allowlist JSON/TOML detection shares the loader rule, dangling allowlist symlinks are refused not replaced, empty --file is a usage error, pure rename/copy/mode changes say content unchanged and copies get copy from/to lines |
| 2026-09-26 | scheduler-tick-errors-never-crash-the-discord-bridge-a-tick-that-throws-sqlite-busy-in-refresh-listdue-claimrun-is: Scheduler tick errors never crash the Discord bridge: a tick that throws (SQLITE_BUSY in refresh/listDue/claimRun) is caught and logged scrubbed and the next tick still runs; fire-and-forget runs never reject and always free their running slot |
| 2026-09-26 | github-plugin-repo-gate-reads-the-allowlist-file-plus-env-overlays-so-file-deny-lists-apply-and-file-only-allow-lists: GitHub plugin repo gate reads the allowlist file plus env overlays so file deny lists apply and file-only allow lists work (GITHUB-6, ALLOW-4) |
| 2026-09-26 | harden-child-process-lifetimes-and-fledge-scoping-issue-112-follow-up-to-154-157-167-fledge-plugin-argv-after-own: Harden child process lifetimes and Fledge scoping (issue #112 follow-up to #154, #157, #167): fledge plugin argv after --, own process group plus tree kill on timeout or abort for Fledge runs, delegate workers and schedule runs, daemon shutdown kills abandoned runs, Fledge commands scoped to the project root they were discovered for |
| 2026-09-26 | agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is: Agent run summaries are secret-scrubbed before every length clip, and a private-key block cut before its END line is redacted |
| 2026-09-26 | discord-ask-ephemeral-buttons-session-multi: DISCORD-ASK-1..5 ephemeral button asks + SESSION-MULTI-1..4 per-user sessions (package 0.0.22) |
| 2026-09-26 | discord-ask-1-5-ephemeral-discord-button-asks-session-multi-1-4-per-user-sessions-package-0-0-22: DISCORD-ASK-1..5 ephemeral Discord button asks + SESSION-MULTI-1..4 per-user sessions; package 0.0.22 |
| 2026-09-26 | parking-a-talk-s-worktree-records-the-parked-state-before-removal-and-bind-re-creates-a-recorded-worktree-whose: Parking a talk's worktree records the parked state before removal and bind re-creates a recorded worktree whose directory is gone, so a crash between park and row delete never leaves a dead cwd (SESSION-WORKTREE-3) |
| 2026-09-26 | allowlist-file-toml-reader-loads-multi-line-arrays-and-fails-closed-on-anything-it-cannot-parse-so-file-deny-lists-are: Allowlist file TOML reader loads multi-line arrays and fails closed on anything it cannot parse, so file deny lists are never silently dropped |
| 2026-09-26 | discord-ask-6-7-tighten-ask-ux: DISCORD-ASK-6/7 collapse thinking into Choose stub; edit stub/thinking into final answer; package 0.0.23 |
| 2026-09-26 | discord-ask-6-7-tighten-ask-ux-collapse-thinking-into-one-choose-stub-edit-stub-thinking-into-final-answer-instead-of: DISCORD-ASK-6/7 tighten ask UX: collapse thinking into one Choose stub; edit stub/thinking into final answer instead of Done+extra reply; package 0.0.23 |
| 2026-09-26 | align-session-start-and-work-with-discord-ask-7-collapse-thinking-into-one-final-message-instead-of-done-embed-plus: Align /session start and /work with DISCORD-ASK-7: collapse thinking into one final message instead of Done embed plus interaction reply |
| 2026-09-26 | discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume: DISCORD-ASK-8: clear ephemeral choice buttons on pick and delete Got-it Working ephemeral after resume |
| 2026-09-26 | bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge: Bridge marks a reply interrupted after a restart: in-flight replies are recorded in the shared DB and the next bridge start edits the frozen progress embed to a failed interrupted status (or replies to the request message) instead of leaving it at working forever |
| 2026-09-26 | safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend: SAFE-8 review follow-up for PR #160 (issue #98): a post that did not go out hands back the 80% spend warning and the spend-cap owner ping on every bridge surface (a slash reply that fails, e.g. an expired interaction token, still posts the owner notice), a warning claimed while spend is back under 80% stays pending for the next post at 80% or more, and a spend-cap stop is never kept as the session pending ask |
| 2026-09-27 | safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8: SAFE-8 x DISCORD-ASK-7 (issue #98, merge of #208): /work and /session start answer in one collapsed message and keep the SAFE-8 owner notice a fresh channel post; an ask run never shows Done, and claims go back when nothing carried the notice |
| 2026-09-27 | a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message: A /work or /session start run that stopped to ask keeps the ask as the session's pending ask and its answer message continues the session, so a thin reply restates the question, cancel clears it and a substantive reply resumes with the question as context (AUTONOMY-1/5/6, REQ-discord-044); a spend-cap stop is never pending |
