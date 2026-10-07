---
module: discord
version: 102
status: draft
files:
  - src/discord/types.ts
  - src/discord/config.ts
  - src/discord/protocol-version.ts
  - src/discord/image-attachments.ts
  - src/discord/memory-inject.ts
  - tests/discord.memory-inject.test.ts
  - src/discord/identity-inject.ts
  - src/discord/injection-guard.ts
  - tests/discord.identity-inject.test.ts
  - tests/discord.identity-pick.test.ts
  - src/discord/permissions.ts
  - src/identity/owner.ts
  - src/identity/people.ts
  - src/identity/index.ts
  - src/identity/github-user.ts
  - tests/identity.people.test.ts
  - tests/identity.github-numeric-id.test.ts
  - tests/identity.recognise.test.ts
  - tests/identity.owner.test.ts
  - tests/discord.owner.test.ts
  - src/discord/session-store.ts
  - src/discord/session-thread.ts
  - tests/discord.session-thread.test.ts
  - tests/discord.session-thread.unit.test.ts
  - src/store/conversation.ts
  - tests/session.condense.test.ts
  - tests/store.conversation.test.ts
  - tests/discord.session-resume.test.ts
  - src/store/db.ts
  - src/store/index.ts
  - src/store/paths.ts
  - src/store/session-ttl.ts
  - src/store/scrub.ts
  - tests/store.scrub.test.ts
  - src/worktree/index.ts
  - src/worktree/manager.ts
  - src/worktree/cleanup.ts
  - src/worktree/base.ts
  - tests/worktree.test.ts
  - tests/discord.session-worktree.test.ts
  - tests/discord.session-persona.test.ts
  - tests/worktree.project-scope.test.ts
  - tests/discord.nongit-project-dir.test.ts
  - src/memory/types.ts
  - src/memory/store.ts
  - src/memory/index.ts
  - src/memory/scope.ts
  - src/memory/profile.ts
  - src/memory/forget.ts
  - src/memory/rank.ts
  - src/memory/card.ts
  - src/discord/approve-card.ts
  - src/discord/approval-cards.ts
  - src/approvals/store.ts
  - src/approvals/code.ts
  - tests/discord.approval-cards.test.ts
  - tests/approvals.code.test.ts
  - tests/discord.gateway-no-cut.test.ts
  - tests/fixtures/approval-code.ts
  - src/discord/forget-card.ts
  - tests/discord.forget-card.test.ts
  - src/discord/hi-card.ts
  - tests/discord.hi-card.test.ts
  - src/discord/spend-card.ts
  - tests/discord.spend-card.test.ts
  - src/discord/watch-ask.ts
  - tests/discord.admin-forget.test.ts
  - tests/memory.store.test.ts
  - tests/memory.spawn-env.test.ts
  - tests/memory.rank.test.ts
  - src/discord/private-reply.ts
  - tests/memory.private-view.test.ts
  - src/discord/work-store.ts
  - src/discord/message-router.ts
  - tests/discord.actor-gate.test.ts
  - tests/discord.forward-channel.test.ts
  - tests/discord.thread-deny.test.ts
  - tests/discord.ask-button-gates.test.ts
  - tests/discord.thread-sessions-per-user.test.ts
  - src/discord/agent-client.ts
  - src/discord/gateway.ts
  - src/discord/presence.ts
  - src/discord/bridge.ts
  - tests/discord.login-failure.test.ts
  - src/discord/thinking-status.ts
  - src/discord/rich-reply.ts
  - tests/discord.rich-reply.unit.test.ts
  - tests/discord.rich-replies.test.ts
  - src/discord/slash-finish.ts
  - src/discord/slash-commands.ts
  - src/discord/register-commands.ts
  - src/discord/slash-types.ts
  - src/discord/slash-dispatch.ts
  - src/discord/command-handlers/session.ts
  - src/discord/list-scope.ts
  - tests/discord.session-list-scope.test.ts
  - tests/discord.slash-ask7.test.ts
  - tests/discord.slash-choose-ask.test.ts
  - tests/discord.slash-reply-continuity.test.ts
  - src/discord/command-handlers/status.ts
  - src/discord/command-handlers/agents.ts
  - src/discord/command-handlers/work.ts
  - src/work/pr.ts
  - src/work/pr-body.ts
  - tests/work.pr.test.ts
  - tests/roles.community-no-work.test.ts
  - tests/fixtures/team-people.ts
  - src/discord/command-handlers/mute.ts
  - tests/discord.rate-mute-limits.test.ts
  - src/discord/command-handlers/schedule.ts
  - src/discord/command-handlers/announce.ts
  - src/discord/command-handlers/admin.ts
  - src/discord/admin-allowlist.ts
  - src/discord/admin-people.ts
  - src/discord/channel-autocomplete.ts
  - tests/discord.admin-slash.test.ts
  - tests/discord.admin-lists.test.ts
  - tests/discord.admin-mutes.test.ts
  - tests/discord.admin-people.test.ts
  - tests/discord.channel-autocomplete.test.ts
  - src/discord/announce-store.ts
  - src/discord/announce.ts
  - tests/discord.announce.test.ts
  - tests/discord.update-post.test.ts
  - src/scheduler/cron.ts
  - src/scheduler/store.ts
  - src/scheduler/service.ts
  - src/scheduler/index.ts
  - src/scheduler/briefing.ts
  - tests/cos.briefing.test.ts
  - tests/identity.briefing-hours.test.ts
  - tests/discord.schedule.test.ts
  - tests/scheduler.cron.test.ts
  - tests/scheduler.service.test.ts
  - tests/scheduler.worktree.test.ts
  - tests/scheduler.tick-errors.test.ts
  - tests/scheduler.never-stuck.test.ts
  - tests/scheduler.ask-outbox.test.ts
  - tests/scheduler.ask-block.test.ts
  - tests/scheduler.actor-gate.test.ts
  - tests/scheduler.injection.test.ts
  - src/discord/requester-perms.ts
  - src/discord/index.ts
  - plugins/discord/index.ts
  - tests/discord.protocol-version.test.ts
  - tests/discord.presence.test.ts
  - src/discord/ask-ping.ts
  - src/discord/spend-post.ts
  - src/discord/spend-dm.ts
  - src/discord/failure-reason.ts
  - tests/discord.failed-reply.test.ts
  - src/discord/public-reply-gate.ts
  - tests/discord.public-reply-gate.test.ts
  - tests/discord.spend.test.ts
  - tests/discord.spend-dm.test.ts
  - tests/discord.status-audit.test.ts
  - tests/discord.ask-ping.test.ts
  - src/discord/thin-ack.ts
  - tests/discord.thin-ack.test.ts
  - src/discord/ask-buttons.ts
  - src/discord/schedule-ask.ts
  - tests/discord.schedule-ask.test.ts
  - src/agent/ask-options.ts
  - tests/discord.ask-buttons.test.ts
  - tests/discord.ask-answer-modal.test.ts
  - tests/discord.ask-ephemeral.test.ts
  - tests/discord.expired-asks.test.ts
  - tests/discord.ask-scrub-first.test.ts
  - src/discord/inflight-replies.ts
  - tests/discord.inflight-replies.test.ts
  - src/discord/run-control.ts
  - tests/discord.run-queue.test.ts
  - tests/discord.stop-run.test.ts
  - src/discord/schedule-stop.ts
  - tests/discord.schedule-stop.test.ts
  - src/discord/allowed-mentions.ts
  - tests/discord.allowed-mentions.test.ts
  - plugins/discord/send-file.ts
  - tests/discord.send-file.test.ts
  - tests/discord.safe3a-surface.test.ts
  - tests/scheduler.owner-role.test.ts

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
allowlists at runtime (ADMIN-1..4 / REQ-discord-043) and the deny lists and
GitHub repo allow lists (`/admin deny`, `/admin github`; ADMIN-3.c part 1,
REQ-discord-043) and mutes (`/admin mutes`, with `/mute` / `/unmute` as
audited aliases; ADMIN-3.c part 2, REQ-discord-010/011); channel options use
STRING + autocomplete (searchable name/id) instead of the native CHANNEL picker.

## Public API

Session thread (AGENT-6 / REQ-discord-072): `src/discord/session-thread.ts`
exports `SessionTurn`, `formatSessionThread` / `withSessionThread` (the
labelled replay block, optional `summary`, `SESSION_THREAD_HEADER` /
`SESSION_THREAD_FOOTER`, `formatSessionThreadOmitted`), `clipTurnText`,
`answerTurnText`, `ensureSessionTurns` and the limits
`SESSION_THREAD_BUDGET_CHARS` (32000, the block's transport ceiling),
`SESSION_THREAD_TURN_MAX_CHARS` (1500, agent turns),
`SESSION_THREAD_HUMAN_TURN_MAX_CHARS` (8000, human turns) and
`SESSION_THREAD_MAX_TURNS` (200);
`SessionStore.recordTurn(session, role, text)` records one turn (the
human's words as a run starts, the posted answer or failure line when it
ends) and `SessionStore.threadFor(session)` returns them oldest first.

Condensed conversations (SESSION-5/6, SESSION-3.a, AGENT-6.a /
REQ-discord-472): `src/store/conversation.ts` exports the window
(`resolveContextWindowTokens(env)`, `CONTEXT_WINDOW_ENV`
= `CORVIDINHO_LLM_CONTEXT_TOKENS`, `CONTEXT_WINDOW_DEFAULT_TOKENS` 8192,
`CONTEXT_WINDOW_MIN_TOKENS` 1024, `CONDENSE_AT_FRACTION` 0.8,
`CHARS_PER_TOKEN` 4, `condenseBudgetChars(window)`,
`CONVERSATION_PROMPT_MAX_CHARS` 32000, `estimateTokens`), the pure
condensing (`condenseConversation`, `boundConversation`,
`pinnedTurnIndexes`, `summaryPoint`, `appendSummary`, `summaryCapChars`,
`formatConversationBlock` / `withConversationBlock`, `SUMMARY_LABEL`,
`clipTurnForRole`, `ConversationTurn` / `Conversation`; the block quotes
replayed turns and summary points as data and a summary point keeps an
untrusted-data fence's own markers around the words it holds, SAFE-12 /
REQ-discord-071), and the retained
store (`ConversationStore`: `get`, `forSession`, `latestForThread`,
`byBotMessage`, `save`, `delete`, `purgeExpired`, `deleteForPerson`;
`forgetConversations(db, person)`; `ConversationRecord`,
`discordThreadKey`, `watchThreadKey`, `discordParticipant`,
`githubParticipant`, `githubIdParticipant` (`github-id:<n>`, MEMORY-ACL-6.a),
`CONVERSATION_RETENTION_MS` 30 days,
`CONVERSATION_KEEP_TURNS` 20, `CONVERSATION_KEEP_BOT_MESSAGES` 100).
`SessionStoreOptions.contextWindowTokens` (bridge:
`resolveContextWindowTokens(env)`); `SessionStore.threadPrompt(session,
prompt, { windowTokens? })` returns the prompt with the condensed block and
stores a fold; `summaryFor(session)`; `retainedForReply(botMessageId)` /
`retainedForThread(threadId, userId)` / `resumeFromRetained(record, where)`
(the router's SESSION-3.a path; reads the record again, returns undefined
when it is gone, and keeps the conversation's project); `forgetConversations(userId)` and
`purgeExpiredConversations()`; `forgetTurnsOfUsers(userIds)` (the approved
forget-me, REQ-discord-101) also drops those users' live summaries and
retained records. `forgetMemoryTargets` (`src/memory/forget.ts`) deletes the
person's retained records (Discord ids, a declared person's GitHub logins and
numeric ids, and the login and numeric id a GitHub ask came from,
MEMORY-ACL-6.a / REQ-discord-1016) in the approval's transaction and returns
their count (`conversations`). `src/discord/bridge.ts` exports
`CONVERSATION_PURGE_INTERVAL_MS` (hourly purge while running).

Approve/Deny cards (SAFE-18..20 / REQ-discord-096):
`src/discord/approval-cards.ts` exports `createApprovalCards(deps)` →
`ApprovalCards` (`deliver()` → `ApprovalDeliveryResult` `{ posted, expired,
notified }`, `press(interaction, parsed, mayDecide)`, `start(pollMs)`,
`stop()`, `settle(ms)`, `has(kind)`), the kind contract (`ApprovalKind`,
`ApprovalKindStore`, `ApprovalRecord`, `ApprovalCardView`,
`ApprovalTelling`, `AnyApprovalKind`), `storedApprovalKind(opts)` (a kind
over `approval_requests`), `mustAskApprovalKinds(opts)` (the must-ask gate's
`mustask` destructive and `mustask-post` plain kinds, REQ-discord-097),
`memoryApprovalKind(opts)` (the `memory` kind, class `destructive`, over
`approval_requests`: audit prefix `memory`; the owner's own memory forget and
override by id — Approve only records the decision, the waiting run uses it
once; SAFE-18.a, REQ-discord-183),
`APPROVAL_POLL_MS` (5 s), `APPROVAL_DM_RETRY_MS`
(60 s), `APPROVAL_NOT_OWNER` and `APPROVAL_UNKNOWN_KIND`.
`src/discord/approve-card.ts` exports the custom ids
(`approveCardCustomId` / `parseApproveCardCustomId`, decisions `approve |
deny | code | submit`), `buildApproveDenyComponents`,
`buildCodeStepComponents`, `buildCodeModal`, `APPROVAL_CODE_INPUT_ID`,
`formatApprovalCard` (`APPROVAL_TITLE_MAX` 100, `APPROVAL_FIELD_MAX` 500,
`APPROVAL_NOTE_MAX` 400), `formatApprovalTextParts` (`APPROVAL_TEXT_PARTS_MAX`
10), `formatDecidedCard`,
`isApproveCardExpired` and the free-form `formatApproveCard`.
`src/approvals/store.ts` exports `ApprovalStore` (`request`, `get`,
`undelivered`, `expiredPending`, `pending`, `markCardPosted`, `resetCard`,
`decide`, `consume`, `waitForDecision`), `approvalActionHash`,
`storedApprovalAction`, `approvalClassOf`, `classNeedsCode` and the types
`ApprovalClass`, `ApprovalStatus`, `ApprovalRequest`, `ApprovalAction`,
`RecordApprovalInput`. `src/approvals/code.ts` exports `issueCode`,
`verifyAndConsume` (`CodeCheck`, `CodeRefusal`), `voidCodes`,
`purgeOldCodes`, `normalizeApprovalCode` and `APPROVAL_CODE_ALPHABET`,
`APPROVAL_CODE_LENGTH` (8), `APPROVAL_CODE_TTL_MS` (2 min),
`APPROVAL_CODE_KEEP_MS`. `src/discord/forget-card.ts` exports
`forgetApprovalKind(deps)` (the `forget` kind) and `createForgetCards(deps)`
(the engine with only that kind). `src/discord/spend-card.ts` exports
`spendApprovalKind(opts)` (the `spend` kind, class `money`, over
`approval_requests`: audit prefix `spend-cap`; Approve only records the
decision, the waiting run uses it once — REQ-discord-198, SAFE-8 / SAFE-8.a),
`SPEND_CARD_NOTHING_DONE` ("nothing was spent"), `SPEND_CARD_APPROVED`
(the card's outcome line) and `SPEND_CARD_UNKNOWN_APPROVED` (the outcome line
of a card whose amount is unknown, SAFE-16.a, REQ-discord-199).
`src/discord/hi-card.ts` exports `hiCaptureApprovalKind(deps)` (the `hi`
kind, class `plain`, over `hi_capture_requests`: audit prefix `hi-capture`,
plus one `hi-capture-criterion` row per captured criterion; AGENT-18 hi
drafts, REQ-discord-521), `HI_CARD_KIND`, `HI_CARD_TITLE`,
`HI_CARD_NOTHING_DONE` ("nothing was captured"), `hiCardView(req)`,
`hiCardActionHash(req)` and `hiCardOutcomeText(req)`; Approve commits the
capture on the session's branch (`hiCaptureCommitMessage(req)` in
`src/agent/hi-drafts.ts`; the request records the commit). An `ApprovalKind` may
declare `prepare(req)`, which Approve awaits after the hash check and before
the SAFE-5 `started` row (a throw: nothing runs, the request stays open).
`src/memory/card.ts` exports `askMemoryCard(input)` (records the `memory`
card for a forget or override by id and waits for the answer →
`MemoryCardAnswer`: approved and used once, or denied / expired / aborted),
`memoryCardFields(op, row, content, surface)` (`MemoryCardFields`: title,
action, target, amount and the override's text), `setMemoryCardTestHooks`
(`MemoryCardTestHooks`), `MEMORY_CARD_KIND` (`memory`), `MEMORY_CARD_CLASS`
(`destructive`), `MEMORY_CARD_TTL_MS` (5 min), `MEMORY_CARD_POLL_MS` and
`MEMORY_CARD_NOTHING_DONE` ("nothing was forgotten or changed"), all
re-exported from `src/memory/index.ts` (SAFE-18.a, REQ-discord-183 /
REQ-plugins-183); the typed confirm token module (`src/memory/confirm.ts`) is
gone.
`SlashCtx.deliverApprovalCards` runs one card pass when a `/work` run ends. `src/memory/forget.ts` adds
`previewForgetTargets` (`ForgetCounts`) and `ForgetRequestStore.resetCard`.
`StartBridgeResult.deliverApprovalCards` (and `deliverForgetCards`, the same
pass); `StartBridgeOptions.approvalPollMs`. `src/discord/gateway.ts` exports
`boundedContent` and `DiscordContentTooLongError`; `src/discord/rich-reply.ts`
`DISCORD_DM_MAX` (1900); `src/discord/ask-buttons.ts` `ASK_EPHEMERAL_MAX`.

Scrub at rest (REQ-discord-066, SAFE-6): `src/store/scrub.ts` exports
`scrubSecrets` / `scrubOpt`, `scrubJsonText(raw)` (scrubs every string value
of one stored JSON document, key names unchanged, re-serialized only when a
value changed; text that does not parse is scrubbed as text, `parsed: false`),
`SCRUB_TARGETS` (text `columns` per table plus `json` columns:
`discord_sessions.pending_ask`), `rescrubDatabase` (returns
`rowsUpdated`, `byTable` and `jsonUnparsed`, and logs one
`[scrub] <table>.<column>: N stored value(s) were not valid JSON` line per
column, never the text) and `ensureScrubbed`; `SCRUB_RULES_VERSION` is 3.

Error lines (REQ-discord-417, SAFE-6): `formatErrorLine` / `ERROR_LINE_MAX`
(`src/store/scrub.ts`) turn any thrown value into one scrubbed operator line;
`formatDiscordLoginFailure` (`bridge.ts`) words a rejected gateway login;
`formatRegisterCommandsFailure` (`register-commands.ts`) words a failed slash
registration (CLI `register-commands` and the bridge's registration on ready).

Update post (DISCORD-ANNOUNCE-4, PERSONA-1.a / REQ-discord-025): `formatBridgeLiveAnnouncement(version?)` (`src/discord/announce.ts`) returns the one-line note the bridge posts on every ClientReady through `postAnnouncement` (announcements channel only): a fixed template in persona.md's voice naming the running version with a `<…>`-wrapped link to that version's GitHub Release (`https://github.com/CorvidLabs/Corvidinho/releases/tag/v<version>`, from `CORVIDINHO_URL`), under 200 characters, no bullets, no model call, nothing read from CHANGELOG.md, scrubbed (SAFE-6) and mass mentions defanged; a version that is not a plain `X.Y.Z` is never echoed and the note links the Releases page instead. The note is system text, not an announcement it starts (AUTONOMY-10.b, REQ-discord-024): the bridge posts it with no Approve card and the public-thread reply gate never holds it or counts it, so it must stay model-free; a `discord-post-message` with the same words still asks (AUTONOMY-10.a).

Export `AnnounceStore` / `postAnnouncement` / `formatBridgeLiveAnnouncement` and `enrichPromptWithMemories`, `formatMemoryInjectBlock`, and related
constants/types from `src/discord/memory-inject.ts` (also re-exported via
`src/discord/index.ts`). `/admin`: `handleAdminCommand`, `formatConfigShow`,
`ADMIN_AUDIT_SURFACE` (`command-handlers/admin.ts`); `planAdminListChange`,
`commitAdminListChange`, `resolveAdminAllowlistPath`, `setTomlDiscordList`,
`setJsonDiscordList`, `writeFileAtomic`, `allowlistFileFormat` (the loader's
`isJsonAllowlistPath` rule), `danglingSymlinkError` (`admin-allowlist.ts`);
ADMIN-3.c (REQ-discord-043): `AdminListKey` (`users`, `channels`,
`deny_channels`, `deny_users`, `deny_roles`, `github.orgs`, `github.repos`,
`github.deny_orgs`, `github.deny_repos`, `github.deny_users`), `ADMIN_LISTS` /
`ADMIN_LIST_KEYS` / `ADMIN_LIST_ENV` (file section, canonical key, the alias
the loader reads, live field, env var), `normalizeAdminListId` (snowflake,
GitHub login with `GITHUB_LOGIN_RE` from `src/identity/people.ts`, or
`ADMIN_GITHUB_REPO_RE`), `liveAdminList`, `adminListFileKey` (the spelling
the loader reads), `readFileAdminList`, `setTomlList` / `setJsonList` and
`allowlistRewriteProblem` (the re-read guard) (`admin-allowlist.ts`);
`OPT_ROLE` (`slash-commands.ts`);
ADMIN-3.c part 2 (REQ-discord-010/011): `applyMuteChange(ctx, interaction,
op, command)` — the one audited mute helper behind `/admin mutes
add|remove` and its aliases `handleMuteCommand` / `handleUnmuteCommand`
(`command-handlers/mute.ts`) — `MuteOp` (`add` | `remove`), `MUTE_ACTIONS`
(`admin-mutes-add` / `admin-mutes-remove`) and `MUTE_SELF_OR_OWNER_REFUSED`
(`command-handlers/admin.ts`, re-exported by `command-handlers/mute.ts`);
`parseJsonObject` (`admin-allowlist.ts`, shared with `/admin people`);
`/admin people` (ADMIN-3.a, REQ-discord-036): `formatPeopleList`
(`command-handlers/admin.ts`); `planPeopleChange`, `commitPeopleChange`,
`setTomlPerson`, `setJsonPerson`, `renderPersonTomlLines`, `samePerson`,
`formatPersonLink`, `PeopleAdminPlan` / `PeopleAdminRequest`
(`admin-people.ts`, the only writer of people and roles; `op: "role"` sets
team / community, ADMIN-3.b). Declared people
(IDENTITY-13/14/7/7.a, `src/identity/people.ts`): `resolvePerson(dir, { discordId,
githubLogin, githubId })` → `{ personId, displayName?, role?, person }` | null
(the one resolver; stable ids only — the Discord user id and, on GitHub, the
numeric id only; `githubLogin` is accepted and ignored, REQ-discord-367;
`role` is `owner` for the configured owner, else the declared `team` /
`community`), `peopleWithoutGithubId(dir)` (person ids with a GitHub login
but no numeric id, for doctor), `roleOfPerson` (effective
role: undeclared or no `role` key ⇒ community, IDENTITY-8/12),
`normalizePersonRole`, `PersonRole` / `DeclarableRole`, `PERSON_ROLES`,
`DECLARABLE_ROLES`, `DEFAULT_PERSON_ROLE`, `loadDeclaredPeople({ allowlist, owner })`
(re-reads `allowlist.sourcePath`, never throws), `buildPeopleDirectory`,
`loadPeopleDirectory`, `readPeopleFile`, `parsePeopleToml` /
`parsePeopleJson` / `parsePeopleText`, `normalizePersonLink`,
`normalizeDiscordUserId`, `normalizeGithubId`, `validGithubLogin`,
`cleanPersonLabel`, `PERSON_ID_RE`, `OWNER_PERSON_ID`, `PERSON_KEYS`,
`LINK_FIELD` and the `DeclaredPerson` / `PeopleDirectory` / `ResolvedPerson`
types; briefing hours (COS-2.a, REQ-discord-102): `DeclaredPerson.timezone` /
`workingHours` from the `timezone` / `working_hours` keys,
`normalizePersonTimezone` (IANA name → canonical spelling, else undefined),
`parseWorkingHours` → `WorkingHours` (`startMinute` / `endMinute`),
`normalizeWorkingHours`, `formatClockMinutes`; `PeopleAdminRequest.timezone`
/ `hours` and `PeopleAdminPlan.timezoneChanged` / `hoursChanged` (`add`). Owner (`src/identity/owner.ts`): `OwnerRecord.githubId` from
`[owner] github_id` (file only), `normalizeGithubId` (shared with people),
`isOwnerGithub(owner, githubId)` (the numeric id only, IDENTITY-7.a).
`/admin people link github:` lookup (REQ-discord-367,
`src/identity/github-user.ts`): `createGithubUserLookup(env)` →
`GithubUserLookup` (`GET /users/{login}`, `GITHUB_USER_LOOKUP_TIMEOUT_MS`),
`GithubUserLookupResult`; `SlashContext.lookupGithubUser` injects it.
`flattenSlashOptions` (`gateway.ts`); `buildChannelAutocompleteChoices` / `matchChannels` / `resolveChannelOption` (`channel-autocomplete.ts`); `SlashInteraction.subcommandGroup` and
`SlashContext.recordAudit`.

Channel autocomplete gate (REQ-discord-431, DISCORD-DENY-3 / ADMIN-4):
`respondChannelAutocomplete` (`gateway.ts`, exported for fixtures) first asks
`GatewayHandlers.mayAutocompleteChannels(actor: AutocompleteActor)`
(`commandName`, `channelId`, `userId`, member `roleIds`) on every request and
answers `[]` exactly once, building nothing, when that is unset, false or
throws; an allowed request is answered once with its choices, or not at all
past the 2.5 s autocomplete deadline. The bridge wires it to the slash gate
order: `gateChannel` → `gateActor` → `resolvePermissionLevel` (with the live
mute set) ≥ ADMIN.

Questions and owner/requester ping (REQ-discord-044, issue #44, AUTONOMY-1/2/4..6 /
DISCORD-ASK / SESSION-MULTI): `src/discord/ask-ping.ts` exports `formatAskReply`,
`defangMassMentions`, `ASK_NO_OWNER_WARNING`, `ASK_REPLY_HINT`, `ASK_ANSWER_HINT`, `ASK_REPLY_MAX`.
Clarify mentions `requesterDiscordId`; stuck mentions the configured owner.
When an ask has structured options (or a numbered list in the question),
`src/discord/ask-buttons.ts` posts a public Choose stub (no MCQ body) and opens
an ephemeral button UI on press (`ASK_BUTTON_TTL_MS` ~30m; late press →
`ASK_CHOICE_EXPIRED`). Free-text clarify remains when options cannot be listed.
Thinking collapses into the Choose stub (DISCORD-ASK-6); done/pick and slash
`/session start` / `/work` prefer editing that message into the final answer
(DISCORD-ASK-7) via `ThinkingStatus.finalizeContent` (`finishSlashWithThinking`). The bridge wires `SlashContext.trackBotMessage`, so that answer message (the collapsed thinking message, or the deferred reply whose id `SlashInteraction.editReply` may resolve with as `{ messageId }`) maps to its session and the session's own user continues it by replying (DISCORD-2 / REQ-discord-002); the tracking write is best effort, so a DB error is logged and never keeps the slash run from resolving its deferred reply. After an ephemeral pick, buttons clear and the Got-it ephemeral is deleted when resume finishes (DISCORD-ASK-8).
`src/agent/ask-options.ts` exports `resolveAskOptions` / `parseChoicesFromQuestion`
and `cleanAskLabel` (whitespace collapsed, SAFE-6 scrubbed, then cut at 80, a cut
label scrubbed once more), which
every option label and every Choose-pick button label (`buildChoiceComponents`)
goes through; the ask question is scrubbed before its 1500 cut
(`normalizeQuestion`), so a question or label that held a secret shows
`[redacted:<kind>]` even when the cut falls inside it (SAFE-6.a / REQ-discord-066).
Gateway `reply` accepts optional `components`; `onComponent` handles button
custom ids. Sessions persist their open asks in `discord_sessions.pending_ask`
(schema v8), keyed by askId (SESSION-MULTI-3 / REQ-discord-044): `pendingAsk`
(with `askId` / `expiresAt` / options) is the newest, the one a thin reply
restates and a free-text reply answers (a button `pendingAsk` past its
timeout is cleared with `clearPendingAsk` before any reply but `cancel` is
gated, so a thin reply never restates it — DISCORD-ASK-5; once a session
question's buttons expire the session stops waiting and the next message runs
normally, while a schedule's questions still wait until answered —
AUTONOMY-6.b), and `openAsks` holds earlier button
asks a later ask did not replace — one JSON object when one ask is open, an
array (oldest first, newest last) when several are. The stored question,
option labels and option ids are secret-scrubbed (SAFE-6 / REQ-discord-066),
and the SAFE-6 re-scrub rewrites the column value by value as JSON
(`scrubJsonText`). `normalizeAskOptions` replaces a model-chosen option id
that looks like a secret with its position, so askId, expiresAt, option ids
and stubMessageId are stored byte-identical; an option id that repeats an
earlier one takes the first unused position number, so every option button
has its own `custom_id` (REQ-agent-045). `SessionStore.setPendingAsk(session, ask)`
stores a new ask beside any open button ask (a superseded free-text ask is
replaced; an askId already held is updated in place; `null` clears every open
ask — explicit cancel), `SessionStore.clearPendingAsk(session, askId)` clears
one ask (a pick, a late press or a free-text answer; the newest remaining one
that has not timed out becomes `pendingAsk`, and timed-out earlier ones are
dropped then, never restated) and `SessionStore.findPendingAsk(askId)` returns the live
session and ask a button press answers. An ask that leaves past its timeout
(dropped, or cleared by a late press) or with its TTL-purged session (at
runtime or on load) is kept as a memory-only `ClosedAsk` (`{ askId, userId,
expiresAt, channelId, threadId? }` — the session's channel and thread, for
the channel gate — never the question or option text; the newest
`CLOSED_ASKS_MAX`, 1000) that `SessionStore.findClosedAsk(askId)` returns, so
the requester's press on it gets `ASK_CHOICE_EXPIRED` (DISCORD-ASK-5 /
REQ-discord-045); a pick, an answer of a live ask and a cancel close nothing. Button pending asks are NOT
cleared by ordinary chat, nor replaced when a later run asks again
(SESSION-MULTI-3); free-text pending still clears on substantive continue.
Message router keys sessions by Discord user id + channel
(SESSION-MULTI-1); reply/thread continue only for the session owner. The
store's thread index (`SessionStore.byThreadUser`) is keyed by thread id +
Discord user id: `getByThread(threadId, userId)` returns that user's session
in the thread, and `getByThread(threadId)` the thread's most recently active
one, whoever owns it; another user starting a session in the thread never
replaces the first user's (DISCORD-2.a / SESSION-MULTI-1/2, REQ-discord-046).
`src/discord/thin-ack.ts` exports `isThinAck` / `isCancelAsk` / `ASK_CANCELLED_ACK`.
`/work` and `/session start` keep a clarify or stuck ask as their session's
`pendingAsk` (never a `spend-cap` stop), and the bridge sets
`SlashContext.trackBotMessage` so the slash answer message continues its
session (AUTONOMY-1/5/6 / REQ-discord-044). When the ask's choices fit a
short list, `buttonAskFor` (`ask-buttons.ts`, over `resolveAskOptions`;
returns a `ButtonAsk` or null) makes the answer the chat's Choose stub
(DISCORD-ASK-1/4): the pending ask keeps its options, `finishSlashWithThinking` / `finishSlashWithOwnerNotice` carry
the stub's `components` on the collapsed edit, the fallback reply
(`SlashReplyPayload.components`) and the owner-notice re-edit, and
`recordSlashStub` stores the answer message id as `stubMessageId` from
`onDelivered(mode, messageId)` (only while that ask is still the pending ask
of a live session), so the chat `onComponent` open/pick path
resumes the session in that message. Otherwise the answer is the free-text
ask: a thin reply restates, cancel clears, a substantive reply resumes with
the question.

Free-text asks answer privately (REQ-discord-548, DISCORD-ASK-4.a): a clarify
or stuck ask whose choices cannot be listed gets `answerAskFor`
(`ask-buttons.ts`; an `AnswerAsk` — the free-text `PendingAsk`, any lone
option dropped, and `buildAnswerStubComponents`, one Primary **Answer**
button on the `open` custom_id — or null for a `spend-cap` stop or listable
options). The post stays `formatAskReply` with the question quoted and
`answerButton: true` (`ASK_ANSWER_HINT` in place of `ASK_REPLY_HINT`), on the
chat reply, a pick or form resume's follow-up ask, a thin-reply restatement
while the ask has not timed out, and the `/work` / `/session start` answer
(`recordSlashStub` records its id); it keeps its footer embed
(`finalizeContent` / `finishSlashWithThinking` `keepFooter`) and its message
id becomes the ask's `stubMessageId`. The requester's press on it (an `open`
press on an ask without options) calls `ComponentInteraction.showModal` with
`buildAnswerModal` (interaction response type 9: `custom_id`
`cvask:answer:<askId>`, title `ASK_ANSWER_MODAL_TITLE`, one Label (type 18)
whose description is the scrubbed start of the question, ≤100 chars, around
one required paragraph text input `ASK_ANSWER_INPUT_ID`, max
`ASK_ANSWER_MAX` = min(`ASK_QUESTION_MAX`, `DISCORD_MODAL_INPUT_MAX` 4000)).
The live gateway routes a MODAL_SUBMIT (interaction type 5) to `onComponent`
through `adaptModalSubmit` (text values by input id in
`ComponentInteraction.modalValues`, via `modalTextValues`; replies parse no
mentions). `parseAskCustomId` reads `answer`; only an `answer` id with
`modalValues` (and never a press id with them) is taken. The submit passes the
channel, actor, mute/rate, not-yours and expiry gates a press passes;
`normalizeAskAnswer` scrubs (SAFE-6) and trims it; the ask is cleared, the
submit gets the ephemeral `ASK_ANSWER_ACK`, and the session resumes like a
pick in the stub (`existingMessageId`) with the prompt a reply that answers
the ask gets (`[Prior clarifying question you asked (the human is answering
it now): …]` + `Human answer:`), `humanText` and the thread turn being the
scrubbed answer; the ack is deleted when the run ends (DISCORD-ASK-8). The
answer reaches the model as the same words in a reply would (SAFE-12/13,
REQ-discord-071): the presser's role is resolved first (with their Discord
role ids, as in chat, so a team member allowlisted by role is team here too); a team or community
answer goes through `fenceSpeakerText` (`source=ask-answer`), and one that
`inboundInjection` flags is refused before the ask is cleared
(`refuseInjectedAnswer`: no run, ask and session kept, ephemeral refusal, one
post in the session's channel replying to the stub that pings only the owner
and is tracked on the session, one `injection-suspected` / `denied` row with
surface `discord:<session>`); the owner's answer is neither fenced nor
scanned. A pick's option label is the model's, but it may repeat a
non-owner's own words, so a team or community presser's pick reaches the
resumed run as their words, inside the same fence (`fenceSpeakerText`,
`source=ask-pick`, the role resolved at press time with their Discord role
ids; not scanned; SAFE-12.a); the owner's pick prompt is byte-identical to
before. A pressed option id that matches none of the ask's options (a forged
or stale id, or a pick id on a free-text ask) gets the ephemeral
`ASK_CHOICE_EXPIRED` and nothing else: no run, the ask left pending, the raw
id in no prompt. A
thin or blank submit (`isThinAck`, AUTONOMY-5) is not an answer: the ask
stays, nothing runs and the question is restated in an ephemeral
`formatAskReply` with the Answer button; a cancel submit (`isCancelAsk`,
AUTONOMY-6) clears every open ask of the session like a cancel reply, with the
ephemeral `ASK_CANCELLED_ACK` and no run. A submit on a Choose ask gets the
not-for-you reply. A press or submit on a free-text ask past its timeout gets
`ASK_CHOICE_EXPIRED` and leaves the ask pending (a reply still answers it).
Schedule asks keep posting text without a button.

Daily spend cap on Discord (REQ-discord-098, issue #98, SAFE-8 as amended /
AUTONOMOUS-8, SAFE-14.a): a `spend-cap` ask posts through `formatAskReply`
with `SPEND_CAP_HEADLINE` ("💸 Work is paused for budget.") /
`SPEND_CAP_STATUS` (paused, not an error) and the owner pinged, and with no
question quote — the question holds the amounts, the cap and the setting, so
it never reaches a channel (SAFE-14.a; `SPEND_PAUSED_TEXT` from
`src/agent/spend-notice.ts`); `askPingKey` keys a `spend-cap` ask on its
reason and the provider caps it stopped at (`spendScopesOf`; the total cap
alone keys on the reason only, as before), so a schedule pings once per
episode of each cap (SAFE-15, REQ-agent-114). `ask-ping.ts` also
exports `appendPostLine` (a SAFE-13 line or a slash owner notice on a post).
`AgentSpawnResult` gains optional `spendWarning` (amounts validated from the
`result` frame by `spendWarningFromUnknown`); no channel post carries it.
`/status`'s LLM line (AGENT-10 / AGENT-13, REQ-discord-015): `formatLlmStatusLine(env,
{ ownerView })` (`src/version.ts`) shows the default tier's `<model> @ <host>`
(non-openai kinds as `kind:model`) or `LLM: none — …` when it has no usable
provider, plus the no-provider notice when any tier has none;
`StatusReportInput.ownerView` (the handler passes `isOwnerViewer`; default
false) decides whether the notice names the tiers and settings (owner) or says
only `No model provider is configured.` (anyone else, like the spend line). At
start the bridge logs `[discord] <notice>` once with `console.warn` when any
tier has no usable provider (REQ-discord-079).
`SlashContext.spendLine(ownerView)` / `StatusReportInput.spendLine` carry
`/status`'s spend line: for the owner (ADMIN, re-checked by the handler) the
24 h spend vs cap line and one line per provider cap (`formatSpendStatusLine`
over `readSpendSnapshot` on the bridge's shared DB, plus a note while a spend
DM waits); for anyone else `formatSpendPublicStatusLine` ("Spend: Work is
paused for budget." while runs stop at any cap, else no line, never which
cap); no new slash command. The bridge builds one
`createSpendAlertOutbox({ db, env })` (`src/agent/spend-outbox.ts`) and shares
it as `SlashContext.spendAlerts` and `SchedulerServiceOpts.spendAlerts`;
`SlashContext.post` is the gateway reply (a fresh channel post).
`src/discord/spend-dm.ts` (SAFE-14.a) exports `createSpendDm({ outbox, owner,
sendDm, log? })` → `SpendDm` (`deliver({ stop?, warning? })` → `SpendDmPass`,
never rejects, one pass at a time; `waiting()`), `spendStopFor(ask, askOwner,
channelId?)`, `formatSpendStopDm`, `formatSpendWarningDm`,
`SPEND_STOP_DM_HEAD`, `SPEND_DM_FAILED_LOG`, `SPEND_DM_NO_PATH_LOG` and the
`SpendStop` / `SpendDmDeps` / `SpendDmOutcome` types: it DMs the configured
owner (the gateway `sendDm`) a cap stop's details (the spend-cap question,
scrubbed and defanged, naming the channel) when that stop's post claimed the
episode's owner ping, and the pending 80% warning (`takeSpendWarning`: the
outbox's, else the run's own; rebuilt with `formatSpendWarningLine`, one line
per cap that crossed 80%, a provider cap's naming its scope); a DM
that does not go out keeps its claim (the warning released to the outbox, the
stop held in memory, the newest replacing it) for the next pass and is logged
once per failure streak without amounts; no owner or no DM path claims
nothing. The bridge shares it as `SlashContext.spendDm` and
`SchedulerServiceOpts.spendDm`, and runs a pass after each chat, button-pick,
`/work` and `/session start` run and on every scheduler tick.
`src/discord/spend-post.ts` exports `askPingOwner` (a `spend-cap` ask pings
once per cap episode via `claimCapPing`, per cap: the episode of each scope
`spendScopesOf` gives — the ask's `spendScopes`, else its stored question's
"Stopped at cap" marker, else the total cap; its `release` hands the ping back
when the post fails), `askNeedsOwner` (stuck and spend-cap ping the owner;
clarify addresses the requester, AUTONOMY-4), `takeSpendWarning`,
`ownerAskNoticeLine` (a spend-cap line says only that work is paused for
budget), `slashOwnerNotice` (the ask's owner line and the SAFE-13 line, never
the warning), `finishSlashWithOwnerNotice`, and the `ChannelPost` /
`OwnerNotice` / `AskPingOwner` types. The chat reply (also the reply to a run
a button pick resumed; a spend-cap stop never gets choice buttons), `/work`,
`/session start` and the schedule post hand the cap ping back when the post
does not go out (`SchedulerOutbound.post` may resolve `false`; a schedule then
keeps no ping key). `OwnerNotice.release` hands back what a
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
ping (stuck and spend-cap only) goes out as a fresh post after the answer
(the 80% warning goes to the owner by DM, SAFE-14.a). `formatAskReply` pings the owner for a `spend-cap` ask like a
stuck one. `formatAskReply` ignores `replyHint` for a `spend-cap` ask.
`ScheduleRunFinished` gains optional `askReason` and `spendWarning`.

Closing role note on the way to a post (REQ-discord-734, ROLES-CHAT-3 /
REQ-agent-333): `ask-ping.ts` exports `POST_SUMMARY_MAX` (1500) and
`clipPostSummary(summary, headLength = 0)`, which caps a run summary at 1500
chars and at what fits after a `headLength`-char post head within
`ASK_REPLY_MAX` (1900) with `clipKeepingRoleNote`. The scheduler's run-row
summary and schedule post, and the `/work` and `/session start` answers, use
it; `appendPostLine` cuts the body for an appended line (a SAFE-13 owner line,
a slash owner notice riding the answer) the same way (ending the kept text in
`…`). A closing `(not allowed for your role)` note
stays last; a summary without it is cut exactly as before.

Collapsed answers still notify (REQ-discord-215, AUTONOMY-2/4, SAFE-8 with
DISCORD-ASK-6/7): Discord does not notify a mention added by a message edit.
`ask-ping.ts` exports `formatCollapsedPing` (one line: each mentioned user with
`COLLAPSED_PING_QUESTION` "↑ question for you" for the requester a clarify ask
addresses, `COLLAPSED_PING_NEEDS` "↑ needs you" for everyone else — the owner
on stuck, a spend-cap stop or a SAFE-13 line; users in `alreadyPinged` left out;
null when nobody is left) and the `CollapsedPing` type. `spend-post.ts`
exports `postCollapsedPing` (sends that line as a fresh post replying to the
collapsed answer, allowed mentions exactly those users; best effort, never
throws, null when nothing went out); `ChannelPost` gains optional
`replyToMessageId`. The chat answer and the answer to a run a button pick
resumed call it after `finalizeContent` succeeds with the answer's
`mentionUserIds` (ask mention plus a SAFE-13 line's owner) and track the ping
post like the answer, so a reply to it continues the session.
`finishSlashWithOwnerNotice` calls it after a collapsed slash answer (also
when there is no owner notice), leaving out the users its owner notice post
already pinged. A fallback reply is itself a fresh post, so it gets no ping.

Interrupted replies (REQ-discord-311, DISCORD-3 / AGENT-3):
`src/discord/inflight-replies.ts` exports `InflightReplyStore` (`begin`,
`setProgressMessage`, `end`, `list` over `discord_inflight_replies`, schema
v9), `recoverInterruptedReplies`, `buildInterruptedEmbed`,
`INTERRUPTED_REPLY_TEXT` / `INTERRUPTED_REPLY_STATUS` and the `InflightReply`
/ `RecoverInterruptedRepliesOptions` / `RecoverInterruptedRepliesResult`
types (`mayPost` option, `skipped` count). The bridge records a row per
message reply and per button-pick run and clears it on every exit — at the
latest when the progress message is edited into the answer / Choose stub
(DISCORD-ASK-6/7) or the fallback reply is posted; a button pick's row points
at the Choose stub it reuses as progress; at start, after the gateway is up, it
marks each leftover reply interrupted where its channel (or thread parent) is
still allowlisted. A chat message that waits for its session's run
(REQ-discord-301) has its row from when it starts waiting (no progress
message until its turn starts), and a reply the bridge's own stop cut short
keeps its row (the tracker's `keep()`), so the next start marks it interrupted.

One run at a time, and stop (AGENT-3.a / AGENT-3.b, REQ-discord-301 /
REQ-discord-302): `src/discord/run-control.ts` exports `SessionRunControl`
(`enqueue(input)` → `SessionRunTurn`, `current(sessionId)`,
`byProgressMessage(messageId)`, `busy(sessionId)`, `stop(runId, byUserId)` →
`RunStopOutcome` (`stopped` | `already` | `none`), `noteForgotten(userIds)`,
`close()`, `settle(ms)`; option `onStopped`), the `SessionRunTurn` handle
(`runId`, `sessionId`, `requesterId`, `channelId`, `waited`, `ready`,
`signal`, `stopReason` (`RunStopReason`: `stopped` | `closed`),
`stoppedBy`, `requesterForgotten`, `setProgressMessage`, `done`),
`RunTurnInput`, `SessionRunControlOptions`, `isStopRunText`,
`RUN_STOPPED_TEXT` (`⏹ Stopped`) and `RUN_STOP_ACK` (`⏹ Stopping the run.`).
The bridge keeps one control: the chat path, an ask pick or Answer submit,
and `/session start` / `/work` (through `SlashContext.runControl`) each take
their session's turn, pass `turn.signal` as `AgentRunChatOpts.signal` and map
their progress message; `RouterDeps.runs` gives `routeMessage` the
`stop_run` route (`RouteAction` kind `stop_run` with `runId` and
`sessionId`); `stop()` closes it first and settles it last. After waiting, a
chat turn re-checks its message with `waitedMessageStillAllowed(msg, deps)`
and a pick or Answer turn its press with `waitedPressStillAllowed(press,
session, deps)` (both `message-router.ts`: channel, actor and mute gates, no
rate count). `/work` exports `WORK_STOPPED_PR_REASON` (the stopped run's PR
line, also used when a stop lands after the agent exited, before the PR step).

The Stop button (AGENT-3.a, REQ-discord-303): `run-control.ts` also exports
`buildStopComponents(runId)` (one row, one danger-style `Stop` button),
`stopRunCustomId(runId)` (`cvstop:<runId>`), `parseStopRunCustomId(raw)`
(the run id, or null for any other id), `RUN_STOP_PREFIX` (`cvstop`),
`RUN_STOP_LABEL`, `RUN_STOP_NOT_YOURS` (`This Stop button isn't for you.`)
and `RUN_STOP_NOTHING_RUNNING` (`Nothing is running.`). `ThinkingStatusOpts`
takes optional `components` (the chat, pick / Answer, `/session start` and
`/work` runs pass `buildStopComponents(turn.runId)`): they go out with the
progress embed (`ThinkingOutbound.sendEmbed` and the gateway's `sendEmbed`
take optional `components`), or replace a reused stub's button; working edits
leave them; `done` / `fail` edit with `components: null`
(`ThinkingOutbound.editEmbed` and the gateway's `editEmbed` take optional
`components`, `null` sent as an empty list), and `finalizeContent` / `discard`
replace them. `recoverInterruptedReplies` edits the interrupted embed with
`components: null`. `memoryThinkingOutbound` records `components` on `sends`
and on `edits` that set them. The bridge's `onComponent` handles a
`cvstop:` press in its own branch (before the ask ids, after the Approve
cards), through `pressPassesGates` — the channel, actor and mute / rate gates
the ask presses use, shared with them — then the run the pressed message
shows (`byProgressMessage`, same channel and id), the requester-or-owner
check and the stop words' `SessionRunControl.stop`.

Stopping a scheduled run (AGENT-3.c, REQ-discord-304):
`src/scheduler/service.ts` exports `ScheduleRunStop` (`begin({ scheduleId,
creatorId, channelId?, title })` → `ScheduleRunStopHandle | null`),
`ScheduleRunStopHandle` (`signal`, idempotent `finish()` → who stopped the
run, if anyone), `SCHEDULE_RUN_STOPPED_SUMMARY` (`stopped`) and
`scheduleRunStoppedError(userId)` (`stopped on Discord by <id>`), all
re-exported by `src/scheduler/index.ts`; `SchedulerServiceOpts` takes an
optional `runStop`. `ScheduleStore.markRunFinished` takes an optional
`stopped` (recorded `failed`, failure count kept, no ask).
`src/discord/schedule-stop.ts` exports `createScheduleRunStop(deps)` →
`ScheduleRunStopControl` (`begin` plus `inOwnerDm(runId)`),
`ScheduleRunStopDeps` (`runControl`, `outbound`, `sendDm`, `editMessage`,
`deleteMessage`, `owner`, optional `model`, `debounceMs`, `tickMs`) and
`scheduleRunProgressText(title)` (`⏳ <title>: running.`). The bridge wires
one control over its `SessionRunControl` into its scheduler; the daemon
passes none. Its `pressPassesGates` takes an optional `{ inDm }` that skips
only the channel gate, set for a press with no guild on a running turn whose
button is in the owner's DM.

Outbound mention safety (REQ-discord-205, DISCORD-8):
`src/discord/allowed-mentions.ts` exports `outboundAllowedMentions({ users,
repliedUser })` (always `parse: []`) and `defangMassMentions` (re-exported by
`ask-ping.ts`). The live gateway's `Client` defaults `allowedMentions` to
`{ parse: [], repliedUser: true }` and every `reply` / `editMessage` / embed
send / embed edit / slash `reply` / `editReply` / component `reply` (and
`update`) payload sets it explicitly; `reply` and `editMessage` add only
`mentionUserIds` as `users`. `LiveGatewayOptions.discord` optionally
injects the discord.js module (tests); default is the dynamic import.

Files and images in replies (REQ-discord-476, DISCORD-17):
`plugins/discord/send-file.ts` registers `discord-send-file` (dangerous,
mutating, minTier 1) through `loadDiscordPlugins` and exports
`DISCORD_SEND_FILE_NAME`, `DISCORD_UPLOAD_MAX_BYTES` (8 MB),
`REPLY_CHANNEL_ENV` / `REPLY_PARENT_CHANNEL_ENV`,
`SEND_FILE_ALLOWED_EXTENSIONS`, `SEND_FILE_DESCRIPTION`, `fileAttachment`
and `gitDiffAttachment`. Args: `<path>` (or `--path`) | `--git-diff
[--staged]`, plus `--caption <text>`; `--channel` / `-c` is refused.
`AgentRunChatOpts.replyChannelId` / `replyParentChannelId` carry the
conversation's channel (the thread and its parent in a thread) and the spawn
client always writes `CORVIDINHO_DISCORD_REPLY_CHANNEL_ID` /
`CORVIDINHO_DISCORD_REPLY_PARENT_CHANNEL_ID` (empty when unset). The bridge
passes them on chat, reply-continue, thread and ask-button runs;
`/session start` and `/work` pass the command's channel; schedules pass none.

`/session start` has an optional `persona` STRING option (REQ-discord-225,
AUTONOMOUS-2 / AUTONOMOUS-5.a): only the owner may set it (anyone else gets
`PERSONA_OWNER_ONLY_LINE` ephemerally and nothing starts); for the owner the
handler checks the persona exists and its model is configured
(`findPersona` / `personaModelRefusal` over `loadPersonas(ctx.personaRoot)`,
one ephemeral line otherwise) before any session or worktree, then passes
`AgentRunChatOpts.persona`, which the spawn client sends as
`task run --persona <name>` before `--task`. The answer head adds
`Persona: <name>`; later replies in that session use `persona.md`.
`SlashContext.personaRoot` is a test seam (default `CORVIDINHO_ROOT`).
`verifyRequesterCanSend` takes `attachFiles` (also AttachFiles; the test
checker gets `{ attachFiles: true }` as a third argument) and
`requester-perms.ts` exports `RequesterNeeds` and `REQUESTER_CANNOT_ATTACH`.
`src/store/scrub.ts` exports `redactSecretEnvValues` (the secret env value
redaction `formatErrorLine` uses).

`src/work/pr.ts` exports `openWorkPr` (the /work → draft PR step, never
throws) with `WORK_PR_PLUGINS`, `OpenWorkPrInput`, `OpenWorkPrDeps` and
`WorkPrOutcome`; `src/work/pr-body.ts` exports `workPrTitle`,
`workCommitMessage` and `buildWorkPrBody` (REQ-discord-088).
`AgentSpawnResult.task` carries the run's verify facts from its result frame.
`WorkPrSkipReason` includes `needs-input`: a `blocked` /work run (it asked a
human) never ships a PR (REQ-discord-044), and `tests-deleted`: a test
deleted or turned off since the branch left its base, or names that could
not be read, keeps the PR from opening (AGENT-15, REQ-discord-185), and
`sdd-uncovered`: in a repo whose SpecSync workflow (read from the
merge-base, HEAD and the work tree, merged fail-closed) requires a change for
meaningful files, a meaningful path changed since the merge-base that no
open change and no change archived on the branch covers, or a diff that
cannot be read, keeps the PR from opening, before the pre-push lane and
before anything is committed or pushed (AGENT-18, REQ-discord-518), and
`hi-changed`: in a repo that uses hi (read from the merge-base, HEAD and the
work tree), anything under `hi/` that differs from the merge-base, committed
on the branch or left in the tree (`hiChangesSince`: a criterion, a retired
entry or any other `hi/` file, an assume-unchanged or skip-worktree edit
included; a `hi/` commit on the branch counts whoever made it, since the PR
would carry it), or a hi/ diff that cannot be read, keeps the
PR from opening before the pre-push lane (so a trusted and a re-run verify
both hold to it) and before anything is committed or pushed; only a path
whose change approved captures alone explain is left out (AGENT-18 hi guard,
REQ-discord-520, REQ-agent-522), and
`not-reviewed`: `github-pr-create` held the PR at the GITHUB-9 second-model
review gate (this step has no run model, so it starts no round; only a tree a
run already had reviewed opens), the line reusing the gate's reason
(`reviewRefusalReason`) with the changes left on the pushed branch
(REQ-discord-088). `SCRUB_TARGETS` lists `pr_review_rounds` (`reviewer`, and
both hold to it) and before anything is committed or pushed: no run can make
an approved capture yet (AGENT-18 hi guard, REQ-discord-520), and
`not-reviewed`: right before the commit, no finished second-model review
covers exactly the tree about to be committed and pushed (`workTreeReviewed`,
src/work/review.ts; the owner or team `/work` run drives the rounds itself,
REQ-agent-092), so nothing is committed or pushed and the line gives the
run's own reason from its result frame (`WorkRunFacts.review`; GITHUB-9.a:
no second model) or `WORK_REVIEW_REFUSAL.notFinished`; or, after the push,
`github-pr-create` held the PR at the same gate, the line reusing its reason
(`reviewRefusalReason`) (REQ-discord-088). `buildWorkPrBody` takes
`reviewed` and then adds `WORK_PR_REVIEWED_LINE` under Verify, pointing to
the `## Second-model review` section `github-pr-create` writes;
`OpenWorkPrDeps.reviewed` injects the tree check in tests. The spawn client
passes the result frame's `review` on `AgentSpawnResult.task`
(`taskReviewFromUnknown`: validated, the reason scrubbed, one line, at most
300 characters). `SCRUB_TARGETS` lists `pr_review_rounds` (`reviewer`, and
the JSON `authors`, `findings`, `changed`; REQ-plugins-092).
`src/worktree/base.ts` exports `resolveBase` (the talk base: the remote's
default branch, else `main`, and HEAD's merge-base with it; shared by
`openWorkPr` and the verify gate), `talkWorktreeGitDir` (the own git dir of a
linked `talk-*` worktree), `takeTalkVerified` / `settleTalkVerified` and
`TALK_VERIFIED_MARKER` (the verified marker a new talk worktree gets from
`ensureTalkWorkspace` and a `done` run writes back; AGENT-15.a,
REQ-agent-015 / REQ-discord-085).

`image-attachments.ts` exports `attachmentCacheDir(workDir)` and
`WORKSPACE_ATTACHMENTS_SUBDIR` (`.corvidinho/attachments`); the bridge binds the
worktree first, then passes `attachmentCacheDir(store.cwdFor(session))` as the
`enrichPromptWithImages` cache dir (REQ-discord-013, DISCORD-9).

`identity-inject.ts` formats/enriches the spawn prompt with acting Discord
user id + resolved display (owner map wins for owner). Gateway fills
`authorDisplayName` / `authorUsername` (and slash `userDisplayName` /
`userUsername`, and `ComponentInteraction.userDisplayName` / `userUsername`
from `componentActorNames`). Bridge (chat and button-pick resume) and slash
handlers inject identity before memory (IDENTITY-4 / REQ-discord-446).
With declared people (`IdentityInjectInput.people`, from `loadDeclaredPeople`
on every run) the block also names `declared_person`, the declared display
(winning over the Discord names), `nicknames` and `github` logins, matched on
the acting Discord user id only (`resolveActingPerson`); once anyone is
declared an undeclared non-owner gets `declared_person: none`; an undeclared
owner's block and every block with nobody declared are unchanged
(IDENTITY-14 / IDENTITY-7, REQ-discord-036).

Roles (IDENTITY-8..12, REQ-discord-065): `resolveDiscordActingRole`
(`permissions.ts`) gives a Discord run's spawn role — `owner` when the caller
resolves to ADMIN, else `team` when the people list declares the caller's
Discord id team, else `community` (blocked callers too). The bridge (chat and
button-pick resume), `/session start` and `/work` pass it as
`AgentRunChatOpts.actingRole`, `/work` also `workTask: true`; the spawn client
always overwrites `CORVIDINHO_ACTING_ROLE` (`owner` when `actingIsAdmin`, else
`team` only when asked, else `community` — schedules pass none) and
`CORVIDINHO_ACTING_WORK_TASK` (`1` / `0`). The tool layer re-resolves the role
on every call (`resolveActingRole`, REQ-plugins-065); the stamp only lowers
it. Surface stamp (SAFE-3.a, REQ-discord-735): `AgentRunChatOpts` gains
`surface?: ActingSurface` (`src/agent/shell-gate.ts`), which the spawn client
always writes to `CORVIDINHO_ACTING_SURFACE` (empty when omitted): the
bridge's chat path passes `chat`, its ask continuation (button pick or
Answer form) `ask`, `/session start` `session`, `/work` `work` and the
scheduler's `runOne` `schedule`. The agent's shell gate (REQ-agent-503)
offers the allowlisted shell, runners and Fledge runs only on the first four,
for the owner, in the talk's own worktree. The spawn client runs
`task run --here --task <prompt> --output ndjson` (REQ-discord-014 /
REQ-discord-073): the run works in the cwd it is given and never makes a
worktree of its own (SESSION-WORKTREE-1.a, REQ-cli-122). Community can't start `/work` (IDENTITY-11.a): right after the SAFE-13
inbound check the handler refuses a community caller (declared community, no
role, undeclared; muted or deny-listed callers too, though the dispatcher's
mute and actor gates stop them first) with the ephemeral `not authorized` of
the owner-only commands, before any deferred reply, session, worktree,
`talk/*` branch, work task, run or PR step; the role comes from the owner
config and the people list re-read for the command. With no owner configured
only a declared team member can start it (IDENTITY-3).
`/work` ships its PR for the owner or a team member (re-resolved after the
run); a team member demoted during the run keeps the branch. `/admin people role person:<id>
role:<team|community>` (ADMIN-3.b) writes the `role` key, owner-only and
SAFE-5 audited like the other people mutations; `/admin people list` shows
each role and `config show` counts them.

Forget from GitHub and from /admin (MEMORY-ACL-6.a, REQ-discord-1016):
`/admin people forget person:<id>` (owner only; handler-time ADMIN re-check;
SAFE-5 `admin-people-forget` `started` then `ok`, `denied` for an id that is
not a declared person, fail closed without the trail) records the same
`forget_requests` ask a person's own request does (`memorySubjectForPerson`,
requester `admin:<owner id>`; an open ask is reused) through
`SlashContext.requestForget` and sends the card at once
(`SlashContext.deliverForgetCards`); the bridge wires both to its DB and
forget cards. The ask kinds live in `requester_user_id` with no schema change
(`ForgetRequester`: a Discord id, `github:<id>:<login>` from a WATCH "forget
me" comment, `admin:<owner id>`; a GitHub ask's thread is
`github:<owner/repo>#<n>` in `origin_channel_id`; `parseForgetRequester`,
`githubOriginOf`, `ForgetRequest.requester`). The card names a GitHub asker
and thread ("asked on GitHub by @login (GitHub account id N) in
owner/repo#n") or "started by you with /admin people forget"; a GitHub asker
is never DMed (the WATCH poller posts the outcome on the thread;
`ForgetRequestStore.unnotifiedGithub`) and an ask the owner started tells
nobody else (marked told when decided; the card shows the outcome).
`forgetTargets` never takes a GitHub or /admin asker for a Discord id and adds
the ask's GitHub login and numeric id (`githubIds`).

`ThinkingStatus` accepts optional `model`, `plumbing` and `showUsage`; footer
shows model and, on done/error, plumbing (`state`/`verified`/`verifySkipped`/
`attempts`); the live token use (`~tok`) shows only when `showUsage` (the
acting user is the owner, DISCORD-15.a; default false). Final chat reply
content remains human text only (DISCORD-3.a).
`ThinkingStatus.finalizeContent` takes optional `extras` (`AnswerExtras`:
`plumbing`, `model`, `spend`) and `failed`: a final answer (no `components`)
keeps a footer-only embed from `buildAnswerFooterEmbed`
(`formatAnswerFooter`: `model | [tokens | cost |] time | plumbing`, done or
error color; tokens and cost only when `extras.spend` is given, which callers
do for the owner's runs only, `tokens unknown` / `cost unknown` when not
known, never $0 — DISCORD-15/15.a, SAFE-16), a Choose stub (`components`)
carries none unless `keepFooter` (a free-text ask's Answer button,
REQ-discord-548), and a later re-edit keeps the first footer (time frozen by
`elapsedMs` / `answerFooter`) and outcome (REQ-discord-457). The bridge chat
and button-pick paths and `finishSlashWithThinking` pass the run's
`thinkExtras` (`model: answerModelFor(result, model)` — the configured model
that answered, `b (fell back from a)` after a failover, AGENT-11 — with
`spend: answerSpendFor(result.usage, model, result.usageByModel)` when
`isOwnerDiscord(owner, actor)`) and the same failed/done outcome as their
fallback status; their fallback replies carry `answerFooter` on the last part.
`DiscordEmbedPayload.description` is optional (omitted on that embed).

Rich replies (REQ-discord-075, DISCORD-16): `src/discord/rich-reply.ts`
exports `DISCORD_MESSAGE_MAX` (2000), `DISCORD_EMBED_DESCRIPTION_MAX` (4096),
`DISCORD_ANSWER_MAX` (6000), `splitDiscordMessage` (fence-safe line split,
the closing notes — the AGENT-11 `(model fallback: …)` note and the role note —
kept whole in the last part), `readsBetterAsEmbed` /
`planAnswerParts` (scrub first, SAFE-6, then cut to `DISCORD_ANSWER_MAX`
keeping a role note; one plain message within 2000, one
embed for long plain prose with no fence, mention or GIPHY media link
(`hasGiphyMediaLink` from `plugins/gif/hosts.ts`: a GIF posted as a link,
PLUGIN-8, shows only when Discord unfurls it, never inside an embed), else
split parts with the
footer on the last), `postAnswerParts` (fresh-reply paths: first part replies
with the answer's mentions, later parts reply to nothing and allow only users
first mentioned in them, so a mention past the first part still pings once;
`keepFooter` keeps the footer beside an Answer button, DISCORD-ASK-4.a)
`answerSpendFor` (tokens and cost from the run's
`usage` and `priceForModel`; with `usageByModel` each model's tokens at its own
price, one unpriced model making the cost unknown, REQ-discord-080) and
`answerModelFor` (the footer's model, REQ-discord-080). `finalizeContent` edits the first part into the
progress message, posts later parts with the optional
`ThinkingOutbound.sendMessage` (no pings; wired to the gateway reply) and
returns `FinalizedAnswer { messageId, messageIds, complete }`; a re-edit edits
only changed parts. `finishSlashWithThinking` takes optional `post` for the
parts after the deferred reply; `finishSlashWithOwnerNotice` appends the
notice without cutting a split answer. The Discord spawn client passes
`bodyMax: DISCORD_ANSWER_MAX` and returns `AgentSpawnResult.usage`, and from
the result frame `model`, `modelFallback` and `usageByModel` (validated); a run
that failed over calls `onModelFallback(hops, sessionId)` — by default one
`[discord] llm.fallback: …` warn line (`warnModelFallback`), the daemon passes
its structured logger (REQ-discord-080, AGENT-11); the
gateway `reply` takes an optional `embed`, and gateway / slash adapters cap
content at 2000.

Listing scope (REQ-discord-418, SESSION-MULTI-1 / IDENTITY-2/3):
`src/discord/list-scope.ts` exports `actorIsAdmin` (the acting user resolves
to ADMIN, the configured owner) and `projectLabel` (an absolute project path
becomes its last segment; a relative name is kept). `/session list` shows
ADMIN every session with its full project path and anyone else only their own
sessions with the project name; `/schedule list` shows a non-ADMIN member the
project name, never an absolute host path. `/status` stays counts-only.

`src/discord/permissions.ts` exports `gateActor` (the chat + slash + ask
button actor gate: deny lists win, non-empty user/role allowlist must match or
be the owner); `RouterDeps.owner` passes the configured owner to
`routeMessage` (REQ-discord-201). `interactionRoleIds` and `RawMemberRoles`
(`gateway.ts`) read an interaction member's role ids for slash and
`ComponentInteraction.roleIds` (set by `adaptComponent`), so an ask button press is gated by role
allow/deny too (REQ-discord-201).
`replyReferenceMessageId`, `REFERENCE_TYPE_FORWARD` and
`RawMessageReference` (`gateway.ts`) turn a MessageCreate `reference` into
`InboundMessage.referencedMessageId` only for a same-channel reply
(REQ-discord-212). `componentChannelAllowlisted` (`message-router.ts`) gates
an ask button press on the press channel and the session's own channel
(REQ-discord-212). `isMonitoredConversation(channelId, parentChannelId, cfg)`
(`permissions.ts`) is the thread-or-parent channel check shared by the
MessageCreate gate, the ask-button gate (for a session a message started in a
thread), restart recovery, `discord-send-file` and the forget card's fallback
notice: the thread or its parent is allowlisted and neither is on
`deny_channels` (deny wins, REQ-discord-212). It sees a parent only where the
bridge knows one (a message in a thread and the run it starts or continues, a
session a message started in a thread and the runs its ask buttons resume);
slash commands (so `/session start` / `/work` runs and the ask buttons of
their sessions), `/schedule` and `discord-post-message` gate the id they are
given (`checkChannel`), so a deny on only the parent does not reach a thread
allowlisted by its own id there.

DISCORD-6 (REQ-discord-010): `rateLimitByLevel` keys on the actor's
`resolvePermissionLevel` on chat and slash unless `RouterDeps.rateLimit.permLevel`
/ `SlashContext.permLevelFor` pins one; `claimRefusalNotice` (with the optional
`RateLimitState.refusalNoticeAt` map) limits public MessageCreate mute/rate
notices to one per user per window; `command-handlers/mute.ts` re-exports
`MUTE_SELF_OR_OWNER_REFUSED` (from `command-handlers/admin.ts`), the
ephemeral refusal for a mute of yourself or the configured owner, and its
`/mute` / `/unmute` handlers are aliases of `/admin mutes add|remove`
(`applyMuteChange`, ADMIN-3.c part 2).

Untrusted text on Discord (SAFE-11/12/13, #71, REQ-discord-071):
`src/discord/injection-guard.ts` exports `fenceSpeakerText(text, role,
source, id?)` / `speakerFenceHeader(role)` / `SpeakerSurface`
(`chat-message`, `session-topic`, `work-task`, `ask-answer`, `ask-pick`), `inboundInjection(text,
role)`, `injectionRefusalHead`, `formatInjectionRefusal(reasons, owner)`,
`refuseInjectedSlash(ctx, interaction, verdict, source)`,
`refuseInjectedAnswer(ctx, interaction, verdict, { sessionId, channelId,
stubMessageId? })` (the Answer form's refusal; returns the owner post),
`formatInjectionOwnerLine(notice, owner)`, `withInjectionNotice(post, notice,
owner, max?)` (`max` defaults to `ASK_REPLY_MAX`; the chat and button-pick
answers pass `DISCORD_ANSWER_MAX`, so the line never cuts a split answer,
DISCORD-16), `auditInboundInjection(recordAudit, …)` and
`INJECTION_NO_OWNER_WARNING`. `src/discord/identity-inject.ts` adds
`cleanedDiscordName(input)` and `displayNameClash(input)`;
`slashOwnerNotice` takes `injection?`; `AgentSpawnResult` gains
`injection?: InjectionNotice` (the spawn client validates the child's
`result.injection` with `injectionNoticeFromUnknown`).

Stuck WATCH asks (AGENT-16.a, REQ-discord-086): `src/discord/watch-ask.ts`
exports `formatWatchStuckAskDm(ask)` (the `formatAskReply` stuck post with no
mention, led by `GitHub <repo>#<n> — answer on the thread: <link>`),
`createWatchAskDelivery({ db, owner, sendDm, now?, log?, spendAlerts? })` →
`WatchAskDelivery` (`deliver()` → `{ sent, failed, expired }`, `stop()`,
`settle(timeoutMs)`) and `WATCH_ASK_RETRY_MS` (10 min). WATCH spend-cap stops
(AUTONOMY-8, REQ-discord-199): `formatWatchSpendStopDm(ask)` (the SAFE-14.a
spend-stop DM with `GitHub <repo>#<n>: <link>` as its second line) and
`formatWatchOwnerAskDm(ask)` (by reason); a spend-cap stop is DMed once per
cap episode (`claimCapPing` on the spend alert outbox; an already told
episode is taken and dropped).

Failed-run replies (DISCORD-3.b, REQ-discord-032):
`src/discord/failure-reason.ts` exports `FAILED_TOLD_OWNER_TEXT` ("That
didn't work — the owner has been told."), `FAILED_TEXT` ("That didn't
work."), `FAILURE_REASON_MAX` (200), `FAILURE_DM_DEDUP_MS` (1 hour),
`failureReasonFromUnknown(v)`, `plainFailureLine(raw, max?)`,
`failureReasonFor(run, env?)`, `formatFailureLog(prefix, surface, exitCode,
reason)`, `formatFailureDm(notice)`, `createFailureOwnerDm({ owner, sendDm,
now?, windowMs? })` → `FailureOwnerDm` (`tell(notice)` → boolean),
`failedRunOutcome(opts)` → `{ body, reason }` and `failedRunReply(opts)` →
the body. `AgentSpawnResult` gains `failureReason?` (the result frame's
`error`) and `stderrTail?` (a failed run's stderr end); `SlashContext` and
`SchedulerServiceOpts` gain `failureDm?: FailureOwnerDm` (the bridge wires one
shared `createFailureOwnerDm` on its gateway `sendDm`; the daemon none).

Public-thread replies (AUTONOMY-10 / 10.a, REQ-discord-099):
`src/discord/public-reply-gate.ts` exports `PUBLIC_THREAD_REPLY_LIMIT` (20),
`PUBLIC_REPLIES_APPROVED_KEY` (`public_thread_replies_approved`, a
`schema_meta` key; no schema change), `PUBLIC_REPLY_KIND` (`reply`) and
`PUBLIC_REPLY_CLASS` (`plain`), `PUBLIC_REPLY_HOLD_TEXT` ("waiting for the
owner's OK before replying here") and `PUBLIC_REPLY_HOLD_LINE` (`⏳ ` + it),
`PUBLIC_REPLY_PROGRESS_TEXT` (the `/session start` / `/work` progress line
in such a thread, in place of the typed topic or description),
`PUBLIC_REPLY_CARD_TTL_MS` (5 min), `PUBLIC_REPLY_POLL_MS`,
`PUBLIC_REPLY_NOTHING_DONE`, `PUBLIC_REPLY_APPROVED`,
`REPLY_PUBLIC_THREAD_ENV` (`CORVIDINHO_DISCORD_REPLY_PUBLIC_THREAD`),
`PublicReplyNo`, `publicReplyNotPostedText(outcome)`,
`approvedPublicReplies(db)`, `countApprovedPublicReply(db)`,
`publicRepliesStillWait(db)`, `publicReplyApprovalKind({ db, now? })` (a
`storedApprovalKind` the bridge registers on its one card engine),
`createPublicReplyGate(deps)` → `PublicReplyGate` (`isPublicThread(id)`,
`mustHold(id)`, `hold(input)` → `PublicReplyOutcome`, `close()`) and the
test seam `setPublicReplyTestHooks`.
The same module exports `isPublicThreadType(type)` (Discord `PUBLIC_THREAD`
11 — forum and media posts included — or `ANNOUNCEMENT_THREAD` 10:
`DISCORD_PUBLIC_THREAD_TYPE` / `DISCORD_ANNOUNCEMENT_THREAD_TYPE`).
`GatewayHandlers` gains `isPublicThread?(channelId)` (the live gateway
fetches the channel and answers `isPublicThreadType(type)`; a channel it
cannot read rejects). `ThinkingStatus.hold(description)`
shows a line on the progress message at once, Stop button kept.
`AgentRunChatOpts` gains `replyPublicThread?` (the spawn client always
writes `CORVIDINHO_DISCORD_REPLY_PUBLIC_THREAD`: `1` or empty);
`SlashContext` gains `publicReplies?: PublicReplyGate`; `slash-finish.ts`
exports `holdSlashReply(opts)`; `SchedulerOutbound.post` takes
`modelText?: boolean`; `plugins/discord/send-file.ts` exports
`sendFileMustAsk(ctx)` (the command's `mustAsk`).

Daily briefings (COS-1 / COS-2 / COS-2.a, REQ-discord-102):
`src/scheduler/briefing.ts` exports `createBriefingTicker(opts)` →
`BriefingTicker` (`tick(now)`, `settle(timeoutMs?)`, `stop()`;
`BriefingTickerOptions`: `db`, `allowlist`, `people()`, `owner()`,
`sendDm()`, `compose`, `github?`, `mutedUsers?`, `onSpendStop?`, `enabled?`,
`log?`),
`createBriefingComposer({ env?, db?, fetchImpl?, personaRoot?,
onSpendWarning?, timeoutMs? })` → `BriefingCompose` (`BriefingComposeInput`
→ `BriefingComposeResult`: `ok` + text, `spend-cap` + ask, or `failed`),
`createBriefingGithub(env)` → `BriefingGithub` (`search(query)` →
`BriefingGithubItem[]`, `requestedReviewerIds(repo, number)`),
`briefingRecipients` → `BriefingRecipient[]`, `briefingHoursFor` →
`BriefingHours`, `briefingSlot` → `BriefingSlot`, `localClock` →
`LocalClock`, `readLocalBriefingFacts`, `readGithubBriefingFacts`,
`BriefingFacts` / `emptyBriefingFacts` / `briefingIsEmpty`,
`renderBriefingFacts`, `cleanBriefingText`, `formatBriefingDm`,
`formatBriefingHours`, the `cos_briefings` store (`BRIEFING_TABLE_SQL`,
`ensureBriefingTable`, `readBriefingRow` → `BriefingRow`, `BriefingStatus`,
`claimBriefingDay`, `recordBriefingSkipped` / `Pending` / `Failed` /
`Budget` / `Sent`, `takeBriefingToSend`, `releaseBriefingSend`,
`expireBriefing`), `consoleBriefingLog` / `BriefingLog` /
`BriefingLogLevel`, `BRIEFING_SYSTEM_INSTRUCTIONS` and the limits
`BRIEFING_DEFAULT_START_MINUTE` (09:00), `BRIEFING_DEFAULT_END_MINUTE`
(17:00), `BRIEFING_FALLBACK_TIME_ZONE` (UTC), `BRIEFING_FIRST_LOOKBACK_MS`
(24 h), `BRIEFING_MAX_LOOKBACK_MS` (7 d), `BRIEFING_MAX_ATTEMPTS` (3),
`BRIEFING_RETRY_MS` (30 min), `BRIEFING_DM_RETRY_MS` (15 min),
`BRIEFING_ITEMS_MAX` (8), `BRIEFING_TEXT_MAX` (1700),
`BRIEFING_LLM_TIMEOUT_MS` (2 min), `BRIEFING_REVIEW_CHECKS_MAX` (10),
`BRIEFING_GITHUB_TIMEOUT_MS` (15 s); `src/scheduler/index.ts` re-exports the
ticker, composer, GitHub reads, recipients, hours and slot.
`SchedulerServiceOpts.briefings` (`Pick<BriefingTicker, "tick">`);
`StartBridgeOptions.briefings` (`false`, or test seams `{ compose?,
fetchImpl?, github? }`).

## Invariants

Daily briefings (COS-1 / COS-2 / COS-2.a, REQ-discord-102): every working
day (Monday to Friday in their zone) the owner and each declared team member
— never community or anyone undeclared, deny-listed, muted or on a clashing
id, and nobody without an owner — get at most one DM, at the start of their
working hours in their zone (`timezone` / `working_hours` on their
`[people.<id>]` entry, set in the file or with `/admin people add`; else the
owner's declared zone, else UTC, and 09:00–17:00), never outside those hours.
The day is claimed in `cos_briefings` (module-owned, no schema version)
before anything is read; a DM whose send started is never sent again. The
facts are that person's only: their `/work` tasks that stopped to ask or
finished since the last briefing (a `blocked` row stays `blocked`, so an
older one is never repeated),
their schedule runs and open schedule questions (by their Discord ids), the
owner's pending Approve card counts (owner only), and GitHub PRs / issues /
review requests in allowlisted repos matched by their numeric id; no facts ⇒
skipped, no model call. One read-tier no-tools model call (persona, rules,
facts fenced as data) under the spend guard writes it; a cap stop raises no
card, skips the day and goes to the owner's spend DM once that day; the
reply is scrubbed, mass mentions defanged and cut, and held scrubbed only
until sent. DM only, through the bridge's gateway `sendDm`; no DM path ⇒
nothing claimed. The bridge runs it on every scheduler tick, and the ticker
itself reads the PLUGIN-5.a scheduler switch (`[corvidinho.plugins] schedule
= false`, or an unreadable switch, ⇒ nothing claimed, written or sent); not
in a dry run without seams; the daemon never sends one. A local day earlier
than the last claimed one (a time zone moved west) is never claimed.

A run a limit I set stopped (AGENT-12, REQ-discord-125) shows it only as
`stopped=turn-cap` / `stopped=idle-timeout` at the end of the answer's footer
and thinking plumbing (chat, ask answers, `/session start`, `/work`), from the
validated `result` frame `stopReason`, never in the channel body; a schedule
post has no footer, so the scheduler logs `[scheduler] schedule <id>: run
stopped=turn-cap …` instead (never the post); a waiting
`ApprovalStore.waitForDecision` holds the run's idle watchdog until the card
is decided, lapses or the wait is aborted.

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
empty admin lists = nobody ADMIN; missing token clean exit; no ProcessManager;
secrets out of repo; discord-post-message dangerous, and every post it makes
waits for the owner's OK on the plain `mustask-post` card showing the exact
defanged text (dictated text and replies to the owner included; a dry run and
a post its channel / requester-flag / token / strict checks refuse raise no
card; the DISCORD-8 requester lookup runs after the Approve), while the bridge
registers the must-ask kinds (`mustAskApprovalKinds`: `mustask` destructive
for prod, `mustask-post` plain) on its one card engine (AUTONOMY-10/10.a,
AUTONOMY-9.a, REQ-discord-097), and the `spend` kind (`spendApprovalKind`,
money: Approve plus the one-time code) that a run held at a spend cap raises
from any process on the data dir — the owner's Approve and code let exactly
that one call through, a Deny, a lapse, a late code or a gone run is a no
and nothing is spent, and amounts stay on the owner's DM card (SAFE-8 /
SAFE-8.a / SAFE-19 / SAFE-20 / SAFE-14.a, REQ-discord-198); thinking status edits one
progress message in-place; slash handlers re-check channel allowlist and
minPermission before acting; rate/mute refuse only the offending user;
outbound post with requesting_user_id verifies requester channel perms, and in a bridge-started run always for the acting Discord user (`CORVIDINHO_ACTING_DISCORD_USER_ID`): a requesting id naming anyone else refuses and a check that cannot run refuses, nothing posted (REQ-discord-012);
every outbound Discord post (gateway reply, message and embed sends/edits,
slash reply/editReply, component reply/update, discord-post-message) parses
no mentions from its content (`parse: []`,
`@everyone` / `@here` defanged); only the replied-to author and the users an
ask names (`mentionUserIds`) may be pinged (REQ-discord-205);
a Discord session runs one turn at a time (chat, ask pick / Answer submit,
`/session start`, `/work`): a message sent meanwhile waits, first in first
out, and a stop never drops it; sessions run in parallel; only the
requester (in their session or by a reply to the progress message) or the
owner (by that reply) stops a run, and the stop kills its process tree
(REQ-discord-301 / REQ-discord-302); the run's progress message carries a
`Stop` button while it runs that only its requester or the owner can press
to stop it, past the channel, actor and mute / rate gates, and that is gone
once the run is done, failed or stopped (REQ-discord-303);
a schedule run the bridge's ticker starts takes a turn on the same control
(session `schedule_<id>`, the creator as requester) and shows the same
`Stop` button (in its channel, or with no channel in the owner's DM), so
only its creator or the owner stops it, the same way; a stopped schedule run
posts nothing but `⏹ Stopped` (and, when a tool result looked like an
injection, one `⏹ <title>: stopped.` line in its channel carrying the SAFE-13
owner line), is recorded `failed` / `stopped` without
counting as a failure or storing an ask, and leaves its schedule as it is;
a run that ends on its own removes its progress message (REQ-discord-304);
a run summary's closing `(not allowed for your role)` note survives every cap
between the agent and the post: schedule run rows and posts, `/work` and
`/session start` answers (fitted under 1900), and an appended SAFE-13 line or
slash owner notice (REQ-discord-734);
`discord-send-file` attaches only in the channel the bridge set for the run
(never a model-chosen one; none ⇒ refused), after the bridge's channel gate
(`isMonitoredConversation` on the bridge's channel set: a thread passes as
itself or through its parent, a deny on the thread or on the parent the bridge set wins) and the acting user's DISCORD-8 check with Attach
Files; at most 8 MB (on the size and on the bytes read, never reading more than 8 MB + 1 byte), PNG / JPEG / GIF / WebP by magic bytes or UTF-8 txt /
log / md / diff / patch / json / csv, text secret-scrubbed (SAFE-6), SAFE-2
protected / `.specsync` / secret paths refused by name, by resolved
target inside the project root and by the file actually opened (read once
from one descriptor, no link followed at the checked path), dry run posts
nothing, audited as a dangerous plugin (REQ-discord-476);
image attachments MIME-allowlisted (jpeg/png/gif/webp) with 20MB/5 caps and
local files inside the session workspace (`<cwd>/.corvidinho/attachments/`,
git-ignored, removed with the workspace on session end) so the agent's
file tools can open them, and opening one with `files-read` hands the model
the image itself as an image part, not decoded bytes (REQ-discord-013,
REQ-plugins-427 / REQ-agent-428); protocol mismatch hard-fails start,
unverifiable soft-continues; `.ts` bins always bun-invoked for protocol and agent spawn;
Discord replies prefer parsed `task run --json` summaries;
slash registration with guild id PUTs guild commands then clears globals;
the live discord.js Client is built with the short Custom Status from the shared package version as its `presence` option, so every gateway IDENTIFY (first login and any non-resumable re-identify after an invalid or expired session) carries it, and ClientReady still sets it; the short-lived DISCORD-8 requester-check Client that logs in with the same bot token identifies with the same presence (`buildVersionPresenceData`, DISCORD-12);
outside allowlist MessageCreate is silent and slash is ephemeral tip (admin) or zero-width ack (non-admin) — never public not-authorized (DISCORD-DENY-1..3);
every MessageCreate is processed only when its own channel (thread parent or the thread itself) is allowlisted and neither the thread nor its parent is on `deny_channels` (a deny-listed thread is refused under an allowlisted parent on chat, thread, reply, ask button, slash, schedule, restart recovery, `discord-send-file` and `discord-post-message`; a deny on the parent alone refuses a thread allowlisted by its own id only where the parent is known — MessageCreate and the restart rows and `discord-send-file` of the runs it starts or continues, and the ask buttons of a session a message started in the thread and their runs — while slash (with `/session start` / `/work` runs and the ask buttons of their sessions), schedule and `discord-post-message` gate the id they are given) — a reply or forward that references a tracked bot message never continues the session in another channel, and the gateway keeps a reference only for a same-channel reply (never a forward); an ask button press resumes only in an allowlisted channel (or the session's thread under an allowlisted parent) while the session's own channel is still allowlisted, else an ephemeral tip (admin) or zero-width ack with no resume (DISCORD-5 / DISCORD-DENY-1..3 / REQ-discord-212);
every @mention/reply/thread message and every slash command also passes `gateActor` after the channel gate: deny-listed users/roles are refused, and when the user or role allowlist is non-empty only listed users, allowed roles or the owner pass; empty user+role lists keep the channel-only path; refusal is silent on MessageCreate and a zero-width ephemeral ack on slash (ALLOW-3/5 / DISCORD-5 / DISCORD-DENY-1..3 / REQ-discord-201);
an ask button press (open or pick) passes channel → `gateActor` (with the press's role ids) → mute/rate (shared per-user state, presser's resolved level) before it opens choices or resumes; a refusal is ephemeral only — zero-width ack for an actor deny, `MUTED` / `RATE_LIMITED` for mute/rate — with no agent run, nothing sent or edited, and the pending ask kept (DISCORD-6 / DISCORD-DENY-3 / REQ-discord-201 / REQ-discord-010);
after those gates, the requester's press on an ask that is no longer open because it timed out (dropped when a newer ask was cleared, or cleared by a late press) or its session was TTL-purged (at runtime or on load) gets only the ephemeral `ASK_CHOICE_EXPIRED` — no agent run, no session, nothing sent or edited — while another user's press, a re-press after a pick and a press after cancel keep the not-for-you reply; the channel gate judges such a press against the closed ask's session channel and thread as for a live ask, so it holds in the talk's thread under an allowlisted parent (DISCORD-2.a) and stays zero-width elsewhere or once that channel left the allowlist; the store keeps such an ask only as `{ askId, userId, expiresAt, channelId, threadId? }` in memory (no question or option text, newest `CLOSED_ASKS_MAX`) (DISCORD-ASK-5 / DISCORD-ASK-8 / SAFE-6 / REQ-discord-212 / REQ-discord-045);
SessionStore/WorkStore MAY persist via shared store SQLite under ~/.local/share/corvidinho with soft TTL ~45m (SESSION-1..4 / REQ-discord-019);
every Discord agent run (chat, button pick, `/session start`, `/work`) records the human's own words with its session as the run starts (so a run that throws or a bridge that dies mid-run keeps the request) and the posted answer or failure line when it ends (a button ask as its question and choices, a spend-cap stop with no answer turn), and a continued run gets those turns, scrubbed, oldest first, in one labelled block ahead of the new message; when that prompt reaches about 80% of the model's window (`CORVIDINHO_LLM_CONTEXT_TOKENS`, default 8192 tokens, never past 32000 chars) the oldest turns fold into the session's summary (extractive points, no model call) while the opening request, the newest human turn and the new message stay word for word, and the summary is stored with the session so a restart or a smaller window picks up from it (SESSION-5/6 / REQ-discord-472); the block is one `[Corvidinho …]` paragraph, so Planning module selection skips it (REQ-agent-004); live turns persist in `discord_session_turns` across a restart within the soft TTL and their rows go with their session (end or TTL) after its conversation is kept 30 days in `conversation_threads`, from which only its own user's reply to one of its answers or message in its thread starts a new session after the gates (SESSION-3.a / AGENT-6.a); turns never reach another user's session, and never feed SAFE-4 confirm tokens, which stay the current message's only (AGENT-6 / DISCORD-2 / SESSION-3 / SESSION-MULTI-1 / REQ-discord-072);
channel autocomplete (`/admin channels add|remove`, `/announce channel`) lists channels only for ADMIN (the owner, not muted, not deny-listed) invoking from an allowlisted channel, re-checked on every request; anyone else, anywhere else, or a gateway with no gate wired gets an empty choice list, so no channel name, id or allowlist entry leaks (DISCORD-DENY-3 / ADMIN-4 / REQ-discord-431);
`/admin` users add | channels add|remove | config show is owner-only with a dispatcher ADMIN floor plus a handler re-check, writes only `[discord].users` / `[discord].channels` of the allowlist file the bridge loaded (atomic temp+rename, other lines kept), updates the live allowlist in place without restart, never writes env values, refuses deny-listed ids, env-only removals and removing the last live channel (a channel also on `deny_channels` does not count as live), warns when the first user narrows STANDARD→BLOCKED, and appends SAFE-5 audit rows (fail closed) (ADMIN-1..4 / REQ-discord-043);
`/admin deny add|remove` (exactly one of channel, user, role, github_org, github_repo, github_user) and `/admin github add|remove` (exactly one of org, repo) share that path: owner re-check, validated entry, env-only refusal on remove, deny-wins refusal on an allow add, never a lockout of the owner (own id, a role held here or `@everyone`, the last undenied channel, own GitHub login or id), SAFE-5 rows `admin-deny-*` / `admin-github-*` (`started` → `ok`/`error`, refusals `denied`, fail closed), the writer edits the loader's spelling of the key and keeps every other key (TOML guard unchanged; JSON guard compares every non-target key), and the live list is spliced in place; `[github].users` stays file / env (ADMIN-3.c part 1 / REQ-discord-043);
`/admin mutes add|remove user:` and its aliases `/mute` / `/unmute` change the live in-memory mute set the chat, slash and ask gates read through one helper (`applyMuteChange`): never the owner or the caller (`denied` row, set unchanged), ADMIN re-checked by the helper itself at handler time on every spelling (`not authorized`, one `denied` row with the `/admin` re-check's digest, never telling a non-owner whether someone is muted), SAFE-5 rows `admin-mutes-add|remove` for every spelling (`started` before the change, then `ok`; no trail or a trail that throws ⇒ refused, set unchanged), no row when nothing changes; mutes stay in memory until a restart (seed `DISCORD_MUTED_USER_IDS`) and the mute reply says so and points to `/admin deny add user:` for a lasting block; an unmute of a seeded id says the next restart mutes them again and that until then the tool layer, which reads that env, still gives their runs community tools (ADMIN-3.c part 2 / REQ-discord-010 / REQ-discord-011);
memories in shared SQLite schema v3 scoped by `owner_user_id` — the acting Discord user id for anyone undeclared, `person:<id>` for a declared person's one profile (MEMORY-5), `project:<key>` for a repo's own memory (MEMORY-6) (src/memory/scope.ts); ADMIN-only forget/override incl. self-forget; empty admin deny-all; no `/memory` slash (MEMORY-1..4 / MEMORY-ACL-1..5 / REQ-discord-021); a person's memory is read only by them and the owner and private notes are never injected or recalled unless asked for by name (MEMORY-7 / REQ-plugins-101); anyone's forget request (`forget_requests`, schema v12, ids and times only; v14 adds the card's action hash) reaches the owner as a DM Approve/Deny card — the `forget` kind (destructive) of the card engine (`src/discord/approval-cards.ts`; `src/discord/forget-card.ts`) — on the engine's own poll (about every 5 s, with or without the scheduler), on scheduler ticks and after each chat message, and only the owner's Approve plus the one-time code typed back, on a pending, unexpired card whose targets and counts are still the ones it showed, forgets — the code used up first, SAFE-5 `started` next (fail closed), then one transaction deletes every memory row of that person and their session turns (and their kept conversations, REQ-discord-472) — telling both; Deny, no answer or a late press is a no (MEMORY-ACL-6 / REQ-discord-101); everything that needs the owner's OK goes through that one engine: a DM card with the exact action, target and amount one line each, a diff or text first as verbatim quoted-data DM parts split fence-safe and scrubbed, buttons last, nothing cut (a card that does not fit is not sent); destructive and money cards (and a kind with no class) also need a one-time code DMed apart from the card, typed only into the code form, valid once, only for that card and action hash, for at most 2 minutes, only a salted hash stored; the owner is re-checked on every press and submit; no answer, a late answer or a gone waiter is a no (SAFE-18..20 / REQ-discord-096); the gateway refuses (never cuts) a DM over 1900 characters and a component reply, code-form reply or message edit over 2000 (REQ-discord-096); a recall with a query is a ranked search (relevance, then recency; `src/memory/rank.ts`) and the chat / button-pick inject searches memory for the message (the owner's and team's `/work` project block for the description), relevant rows first then the newest (MEMORY-9 / REQ-discord-067); the owner's own memory forget and override by id ask on that engine too: the `memory` kind (destructive, so Approve + the one-time code) shows the exact action, the target (id, category/key, owner scope, last changed), one memory as the amount and, for an override, the new text word for word as the quoted-data text first; the run that asked waits and changes the memory only on an approval it uses once, while the memory is still what the card showed; Deny, no answer, a late press, a gone or stopped run is a no; no typed confirm token counts any more (SAFE-18.a / REQ-discord-183 / REQ-plugins-183); Discord agent spawn always overwrites `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty when no actor) and `CORVIDINHO_ACTING_IS_ADMIN` so no run inherits an actor from the bridge env, always clears `CORVIDINHO_ACTING_CONFIRM_TOKENS` (a typed token confirms nothing, SAFE-18.a), and always clears the GitHub commenter keys (`CORVIDINHO_ACTING_GITHUB_*`, MEMORY-8); private notes, profile reads and the owner's view of someone's memory are shown only privately: a run's `privateReplies` (text the model never saw) go to whoever asked by direct message only (`src/discord/private-reply.ts`, scrubbed, split under the DM cap) on chat, a button pick or Answer form resume, `/session start` and `/work`, the channel answer gets a short "sent privately" note on top (or, when the DM did not go out, a "couldn't DM it" note) and never the text, and the session thread never records it (MEMORY-7.a / REQ-discord-710);
`/schedule` list|create|pause|resume|delete with ADMIN mutations, 5m min cadence (a zero cron step — `*/0`, `a-b/0`, `n/0` in any field — is a `CadenceError` refused before any field is expanded, and a range is expanded only up to its field's maximum, so no cadence can hang `/schedule create`, the store's next-run computation or the bridge), schedules in shared SQLite, cooperative ~60s ticker that must not starve HEAR/WATCH ingress (DISCORD-SCHEDULE-1..5 / REQ-discord-020); `/schedule delete` (the schedule and its run history) appends SAFE-5 audit rows (`started` before the delete, then `ok`/`error`; `denied` for a non-ADMIN caller) and fails closed like `/admin` when the trail is unavailable or not wired (SAFE-5 / REQ-discord-020);
a message reply or button-pick run keeps one `discord_inflight_replies` row (ids incl. the thread's parent channel for a message in a thread or a pick on a session a message started there + start time, no text) from before its progress embed is sent until it finishes, cleared on every exit path (including the moment the progress message is collapsed into the answer or Choose stub, DISCORD-ASK-6/7); the next bridge start edits each leftover row's own progress embed to the red failed status `interrupted: Corvidinho restarted before this reply finished — please send it again`, or replies to the recorded request message in the same channel when there is no embed id or the edit fails, then deletes the row — only while the row's channel or parent is still allowlisted and neither is deny-listed (DISCORD-5), sequential, best effort, never throws out of startup, nothing posted when no rows (DISCORD-3 / AGENT-3 / REQ-discord-311);
per-talk/project git worktrees (or scoped dirs) under `.corvid-worktrees`/`WORKTREE_BASE_DIR` with schema v4 session columns; end/TTL parks worktree; project never silent mid-talk switch; schedule ticks use project scope (SESSION-WORKTREE-1..5 / REQ-discord-022); package 0.0.5.
`/work` opens a draft PR only from a verified git worktree with changes, only when `git-commit` (dirty tree), `git-push` and `github-pr-create` are all allowlisted for non-interactive use, and only through those typed plugins; otherwise its reply says plainly why no PR (AUTONOMOUS-3 / GITHUB-2/5/6 / AGENT-4 / REQ-discord-088). Before anything is committed or pushed, the tree is compared by test name with the talk branch's merge-base (`startWorkspaceDiffFrom(…).testDrops()`): a test deleted, retitled or turned off since the branch left its base, or names that cannot be read, is named in the `PR: not opened — …` line and nothing is committed or pushed; a verify lane re-run here must also print a test summary showing tests ran (AGENT-15, REQ-discord-185).
Schedule ticks are safe with a bridge and `corvidinho daemon` on one data dir: each tick `refresh()`es the schedules table, `claimRun()` compare-and-sets a due run so it fires once, and store updates write only their own columns so a finishing run never undoes a pause/resume made elsewhere; each run outcome is recorded once (`onRunFinished`, `drain`, `abandonInFlight` for shutdown) and an abandoned run's spawned agent is killed with its whole process tree through `AgentRunChatOpts.signal` (the spawn client runs each agent in its own process group, AGENT-3) (CLI-8 / AUTONOMOUS-4 / REQ-discord-108). A run never stays "running" forever (REQ-discord-346): `finish()` counts a run recorded only after `markRunFinished` (one IMMEDIATE transaction) succeeds, retrying a throwing write once and otherwise logging `[scheduler] run failed: could not record run …` and counting it failed; the bridge's `stop()` abandons in-flight runs like the daemon (`interrupted: bridge shutdown`); both stops wait ≤3 s (`settleAbandoned`, `ABANDONED_SETTLE_MS`) for aborted runs to park their worktree; each claimed run records its runner (`schedule_runs.runner` = `<pid>:<proc start>`, schema v10), and the bridge and daemon start with `recoverAbandoned()`, which fails runs whose runner is gone (`interrupted: process restarted`, `RUN_INTERRUPTED_BY_RESTART`) and parks leftover `talk-schedule_<schedule>_<run>` worktrees of runs this data dir recorded as no longer running, deleting a branch only when it has no commits of its own; a live runner's run and worktree are left alone, and a schedule-run worktree whose run this data dir does not know (another data dir's, e.g. `bun test` run inside it) is never touched.

Needs-human outbox for schedule runs (REQ-discord-347, AUTONOMY-2 / AUTONOMOUS-7): `markRunFinished` also stores the run's ask on its row (`schedule_runs.ask_reason`, `ask_question` scrubbed and capped at `ASK_QUESTION_MAX`, `ask_posted_at`; schema v11, `SCHEMA_VERSION` 11, partial index `idx_schedule_runs_pending_ask`; `ask_question` is in `SCRUB_TARGETS`), and `ScheduleRun` gains optional `ask` / `askPostedAt`. `ScheduleStore.pendingAsks()` returns, per schedule, the newest finished run's ask when no ticker took it (`PendingScheduleAsk`; an older one is moot once a later run finished, a deleted schedule's runs are gone); `claimRunAsk(runId)` takes an ask with a compare-and-set on `ask_posted_at IS NULL` that also re-checks the run is still its schedule's newest finished run (so an ask made moot while a pass is posting is skipped) and `releaseRunAsk(runId)` hands it back. A `SchedulerService` with an outbound (the bridge) takes its own run's ask before posting it (handed back for the next delivery pass when that post does not go out, since an open ask makes its schedule wait, REQ-discord-606), and each `tick()` starts one fire-and-forget delivery pass (`settleAskDelivery(timeoutMs?)` awaits it; after `stop()` a pass takes no further ask, and the bridge's stop waits ≤3 s, `ABANDONED_SETTLE_MS`, for a post in flight before closing the gateway) that posts pending asks — a run `corvidinho daemon` claimed — for schedules whose creator and channel pass the live DISCORD-SCHEDULE-3 gate (`gateTick`; a refused one stays pending) through the same ask post (`formatAskReply` with the schedule prefix; owner for stuck / spend-cap, creator for clarify; `askPingKey` and `claimCapPing` dedupe; pending 80% warning), handing the ask back when the post resolves `false` or throws (`[scheduler] ask failed: …`). The daemon (no outbound) never takes or posts an ask and keeps its `run.needs_human` log line.
Nightly backup on the scheduler tick (OPS-1/2, REQ-discord-680): `SchedulerServiceOpts.backup` (a `BackupTicker`, `src/store/backup.ts`, REQ-cli-680) is called with the tick's clock after the due runs are claimed and never throws. The bridge builds it over its shared DB with `consoleBackupLog` (`[backup] <event> {json}`, scrubbed) and a `notify` that posts the pending owner notice (`formatBackupNotice`, fixed text, no path or error) to the `/announce` channel through the gateway reply, prefixed `<@owner>` with `mentionUserIds` [owner] (REQ-discord-205), and resolves false when no channel is set, no gateway reply exists or the post fails, so the notice is handed back and retried each tick (`…owner_not_told` logged once) and nothing is posted elsewhere; notices a daemon recorded are delivered the same way, once per failure streak. The bridge's `stop()` stops the backup ticker (no further notice is taken) and waits ≤3 s (`ABANDONED_SETTLE_MS`, `settle(timeoutMs)`) for a notice post in flight before closing the gateway; one still in flight then is handed back, so the next start posts it instead of it being lost. `SchedulerServiceOpts.backup` needs only `tick`. `StartBridgeOptions.schedulerNow` is the scheduler / backup clock test seam.

Stuck WATCH runs reach the owner by DM (AGENT-16.a, REQ-discord-086): with a
DB, every scheduler tick (`onTick`, next to the forget cards) runs one
`createWatchAskDelivery` pass over `watch_owner_asks` (REQ-watch-086): an ask
older than a day is taken and given up with a log line, never sent; with a
live gateway `sendDm` and an owner Discord id, each other ask is taken
(compare-and-delete) and sent to the owner only, by direct message
(`formatWatchStuckAskDm`, question SAFE-6 scrubbed and defanged, no mention,
never a channel); a DM that does not go out is handed back and retried after
`WATCH_ASK_RETRY_MS`. Once the scheduler starts with a live `sendDm`, the
bridge records itself in `schema_meta` (`markBridgeRunning`, a
`<pid>:<proc start>` id) so the watch process knows a bridge will send it;
`stop()` first stops the delivery and clears its own mark, then waits ≤3 s
(`ABANDONED_SETTLE_MS`) for a DM in flight (handing its ask back after that).
Schedules never stop or fail to start silently (REQ-discord-353, AUTONOMY-2): a run whose project cannot be resolved or whose worktree cannot be created (also when that step throws) is still recorded failed with the full error (`project resolve failed: …` / `worktree failed: …`), and `failBeforeRun` also records a `stuck` ask whose question is fixed, path-free text (`PROJECT_RESOLVE_FAILED_QUESTION` / `WORKTREE_FAILED_QUESTION`, exported from `src/scheduler/service.ts`; REQ-discord-418). `ScheduleStore.markRunFinished` takes an optional `autoPause: { at, ask }` and, when the run failed and the SQL `consecutive_failures` reaches `at` in the same transaction, stores that ask instead of the run's own; `finish()` passes `{ at: FAILURE_AUTO_PAUSE, ask: autoPauseAsk(runAsk) }` (`autoPauseAsk(last?)`: `Paused after 5 failed runs in a row. Fix the cause, then resume it with /schedule resume.` plus `Last failure: <question>`) and returns the run's effective ask (the pause ask when `maybeAutoPause` paused), which `onRunFinished.askReason` reports. The bridge posts it through `postOwnRunAsk` (the REQ-discord-347 in-process gate, take and `postRunAsk`; the pausing run's ask replaces its `❌` post and, when the run had no ask of its own, carries only its DISCORD-3.b failed line (REQ-discord-032) as context; a run that throws posts its pause ask at once with no context; an ask whose in-process post did not go out is handed back for the next delivery pass, since a paused or waiting schedule has no next run to post it, REQ-discord-606) and a daemon run's through the next delivery pass; a DISCORD-SCHEDULE-3 refusal records no ask of its own, and the pause ask of refused runs waits for the gate. No schema change.
A schedule's question blocks it until the creator or the owner answers or cancels it (AUTONOMY-6.a, REQ-discord-606): schema v15 (`SCHEMA_VERSION` 15) adds `schedule_runs.ask_options` (JSON, scrubbed labels), `ask_blocking`, `ask_closed_at`, `ask_outcome` (`answered` | `picked` | `cancelled` | `superseded`), `ask_answer` (scrubbed), `ask_closed_by`, `ask_skip_at` and `ask_note_at` (partial index `idx_schedule_runs_open_ask`; `ask_answer` and `ask_options` are in `SCRUB_TARGETS`; the migration makes an ask recorded before it that is still pending on its schedule's newest run blocking, so it is posted with its controls, and closes every other one as `superseded`). `markRunFinished` stores every ask open and blocking with its resolved choices (`resolveAskOptions`; none for a spend-cap stop). `ScheduleStore` gains `openAsk(scheduleId)` / `openRunAsk(runId)` (the newest finished run's ask while nobody closed it: `OpenScheduleAsk`), `closeRunAsk(runId, { outcome, answer?, closedBy })` (compare-and-set on `ask_closed_at IS NULL`, the answer scrubbed), `skipForOpenAsk(schedule, ask)` (the claim's compare-and-set on `next_run_at` without a run row; stamps `ask_skip_at`), `pendingWaitNotes()` / `claimWaitNote(runId)` / `releaseWaitNote(runId)` and `answeredAsk(scheduleId)` (`AnsweredScheduleAsk`, only while that run is the newest finished one); `pendingAsks` and `claimRunAsk` skip closed asks. `SchedulerService.tick()` skips each due run of a schedule with an open ask (listed in `skipped`, no catch-up); its delivery pass posts each open ask's one wait note after the ask, with the ask's controls; every ask post carries `scheduleAskComponents(runId, ask)` and `scheduleAskHint(ask)` (`src/discord/schedule-ask.ts`; `ASK_CANCEL_LABEL`, `cancelCustomId` and the `cancel` kind of `parseAskCustomId` in `src/discord/ask-buttons.ts`; `formatAskReply` takes `hint`); `SchedulerOutbound` gains `components` on `post` and an optional `dm` (the bridge wires `sendDm`), used for a schedule with no channel (the owner's DM; none without an owner); the next run's prompt gets the answered question and the answer (`fenceSpeakerText` for anyone but the owner). The bridge routes every `srun_` ask id to `handleScheduleAskPress(interaction, parsed, deps)` (channel or owner-DM gate, actor gate, mute / rate, creator or live owner, never expiring; `SCHEDULE_ASK_*` texts, `SCHEDULE_ASK_PAUSED_NOTE` on the ack when the schedule is paused, `isScheduleAskId`, `formatScheduleWaitNote`), and a `cancel` press on a session ask gets the not-for-you reply.
Schedules never stop or fail to start silently (REQ-discord-353, AUTONOMY-2): a run whose project cannot be resolved or whose worktree cannot be created (also when that step throws) is still recorded failed with the full error (`project resolve failed: …` / `worktree failed: …`), and `failBeforeRun` also records a `stuck` ask whose question is fixed, path-free text (`PROJECT_RESOLVE_FAILED_QUESTION` / `WORKTREE_FAILED_QUESTION`, exported from `src/scheduler/service.ts`; REQ-discord-418). `ScheduleStore.markRunFinished` takes an optional `autoPause: { at, ask }` and, when the run failed and the SQL `consecutive_failures` reaches `at` in the same transaction, stores that ask instead of the run's own; `finish()` passes `{ at: FAILURE_AUTO_PAUSE, ask: autoPauseAsk(runAsk) }` (`autoPauseAsk(last?)`: `Paused after 5 failed runs in a row. Fix the cause, then resume it with /schedule resume.` plus `Last failure: <question>`) and returns the run's effective ask (the pause ask when `maybeAutoPause` paused), which `onRunFinished.askReason` reports. The bridge posts it through `postOwnRunAsk` (the REQ-discord-347 in-process gate, take and `postRunAsk`; the pausing run's ask replaces its `❌` post and, when the run had no ask of its own, carries only its `failed (exit N)` line as context; a run that throws posts its pause ask at once with no context; an ask whose in-process post did not go out is handed back for the next delivery pass, since a paused or waiting schedule has no next run to post it, REQ-discord-606) and a daemon run's through the next delivery pass; a DISCORD-SCHEDULE-3 refusal records no ask of its own, and the pause ask of refused runs waits for the gate. No schema change.
A schedule's question blocks it until the creator or the owner answers or cancels it (AUTONOMY-6.a, REQ-discord-606): schema v15 (`SCHEMA_VERSION` 15) adds `schedule_runs.ask_options` (JSON, scrubbed labels), `ask_blocking`, `ask_closed_at`, `ask_outcome` (`answered` | `picked` | `cancelled` | `continued` | `superseded`), `ask_answer` (scrubbed), `ask_closed_by`, `ask_skip_at` and `ask_note_at` (partial index `idx_schedule_runs_open_ask`; `ask_answer` and `ask_options` are in `SCRUB_TARGETS`; the migration makes an ask recorded before it that is still pending on its schedule's newest run blocking, so it is posted with its controls, and closes every other one as `superseded`). `markRunFinished` stores every ask open and blocking with its resolved choices (`resolveAskOptions`; none for a spend-cap stop). `ScheduleStore` gains `openAsk(scheduleId)` / `openRunAsk(runId)` (the newest finished run's ask while nobody closed it: `OpenScheduleAsk`), `closeRunAsk(runId, { outcome, answer?, closedBy })` (compare-and-set on `ask_closed_at IS NULL`, the answer scrubbed; outcome `continued` — the owner's Continue on a spend-cap stop, AUTONOMY-8 — hands no answer on, like `cancelled`), `skipForOpenAsk(schedule, ask)` (the claim's compare-and-set on `next_run_at` without a run row; stamps `ask_skip_at`), `pendingWaitNotes()` / `claimWaitNote(runId)` / `releaseWaitNote(runId)` and `answeredAsk(scheduleId)` (`AnsweredScheduleAsk`, only while that run is the newest finished one); `pendingAsks` and `claimRunAsk` skip closed asks. `SchedulerService.tick()` skips each due run of a schedule with an open ask (listed in `skipped`, no catch-up); its delivery pass posts each open ask's one wait note after the ask, with the ask's controls; every ask post carries `scheduleAskComponents(runId, ask)` and `scheduleAskHint(ask)` (`src/discord/schedule-ask.ts`; `ASK_CANCEL_LABEL`, `cancelCustomId` and the `cancel` kind of `parseAskCustomId` in `src/discord/ask-buttons.ts`; `formatAskReply` takes `hint`); `SchedulerOutbound` gains `components` on `post` and an optional `dm` (the bridge wires `sendDm`), used for a schedule with no channel (the owner's DM; none without an owner); the next run's prompt gets the answered question and the answer (`fenceSpeakerText` for anyone but the owner). The bridge routes every `srun_` ask id to `handleScheduleAskPress(interaction, parsed, deps)` (channel or owner-DM gate, actor gate, mute / rate, creator or live owner, never expiring; `SCHEDULE_ASK_*` texts, `SCHEDULE_ASK_PAUSED_NOTE` on the ack when the schedule is paused, `isScheduleAskId`, `formatScheduleWaitNote`), and a `cancel` press on a session ask gets the not-for-you reply. A spend-cap stop's controls are **Continue** (`SCHEDULE_ASK_CONTINUE_LABEL`, its `open` custom id; the live owner's only, closing it `continued` with `SCHEDULE_ASK_CONTINUED_ACK`) and **Cancel** (AUTONOMY-8, REQ-discord-606).

Every schedule post — the `✅` / `❌` result line and each ask post (in-process or from the delivery pass, including these stuck asks) — starts with `scheduleTitle` (`Schedule **<name>** (<id>) on <project>`; an ask about a non-owner's schedule whose stored name trips the SAFE-13 detector leaves the name out, REQ-discord-713), where the project is `projectLabel(schedule.project)` (`src/discord/list-scope.ts`: the last segment of an absolute path, a relative name as given), never an absolute host path, since the whole channel reads it (REQ-discord-353, REQ-discord-418, SAFE-6). The run row keeps the full error and the model's prompt keeps the stored project.
Schedule ticks are safe with a bridge and `corvidinho daemon` on one data dir: each tick `refresh()`es the schedules table, `claimRun()` compare-and-sets a due run so it fires once, and store updates write only their own columns so a finishing run never undoes a pause/resume made elsewhere; each run outcome is recorded once (`onRunFinished`, `drain`, `abandonInFlight` for shutdown) and an abandoned run's spawned agent is killed with its whole process tree through `AgentRunChatOpts.signal` (the spawn client runs each agent in its own process group, AGENT-3) (CLI-8 / AUTONOMOUS-4 / REQ-discord-108). A run never stays "running" forever (REQ-discord-346): `finish()` counts a run recorded only after `markRunFinished` (one IMMEDIATE transaction) succeeds, retrying a throwing write once and otherwise logging `[scheduler] run failed: could not record run …` and counting it failed; the bridge's `stop()` abandons in-flight runs like the daemon (`interrupted: bridge shutdown`); both stops wait ≤3 s (`settleAbandoned`, `ABANDONED_SETTLE_MS`) for aborted runs to park their worktree; each claimed run records its runner (`schedule_runs.runner` = `<pid>:<proc start>`, schema v10, `SCHEMA_VERSION` 10), and the bridge and daemon start with `recoverAbandoned()`, which fails runs whose runner is gone (`interrupted: process restarted`, `RUN_INTERRUPTED_BY_RESTART`) and parks leftover `talk-schedule_<schedule>_<run>` worktrees of runs this data dir recorded as no longer running, deleting a branch only when it has no commits of its own; a live runner's run and worktree are left alone, and a schedule-run worktree whose run this data dir does not know (another data dir's, e.g. `bun test` run inside it) is never touched.
Each schedule run is gated against the live allowlist before any worktree or agent run and again before its post (DISCORD-SCHEDULE-3 / REQ-discord-020): `SchedulerService` checks the creator with `gateActor` (REQ-discord-201: deny wins; a non-empty user/role list must list the creator's id unless it is the configured `owner`; a tick has no member roles) and the channel with `checkChannel`. A refused run spawns nothing, posts nothing and is recorded failed (`creator not allowlisted: …` / `channel not allowlisted: <id>`), counting toward the 5-failure auto-pause. The bridge ticker shares the allowlist `/admin` edits in place; the daemon reloads it before each tick (REQ-cli-108).
A schedule's text is its creator's words (SAFE-12 / SAFE-13, #71, REQ-discord-713): `src/scheduler/service.ts` exports `scheduleInjection(text, role)` (the detector over the name, description and prompt; null for the owner or when nothing trips) and `injectedScheduleQuestion(reasons)`; `SpeakerSurface` gains `schedule-prompt`; `SchedulerServiceOpts` gains optional `recordAudit` (the bridge wires its SAFE-5 trail) and `mutedUsers` (the bridge's live mute set). `/schedule create` resolves the requester's role before the ADMIN gate (as `/work` does) and a non-owner's `name` or `prompt` that trips the detector is refused through `refuseInjectedSlash` with an ephemeral reply (the owner pinged in one fresh channel post, one `injection-suspected` / `denied` row with surface `discord:/schedule`); nothing is stored, and a non-owner create that trips nothing is still the ephemeral `NOT_AUTHORIZED`. Every tick, after the DISCORD-SCHEDULE-3 gate and before any worktree, re-resolves the creator's role (`resolveDiscordActingRole`: live allowlist, owner, mute set, people list; no Discord role ids): stored non-owner text that trips the detector runs nothing — one `denied` row (surface `scheduler:<id>`), the run recorded failed with the stuck ask `injectedScheduleQuestion` (never the text), the schedule paused, and the ask posted through the usual ask path (owner pinged once; a daemon tick leaves it pending for a bridge; titled by id alone when the name is what tripped); otherwise a non-owner creator's run gets `Scheduled work on project: <project>` and its name and prompt inside `fenceSpeakerText(…, role, "schedule-prompt")`, while the owner's schedule keeps its prompt exactly as before. Runs pass no acting role and `actingIsAdmin` only for the live owner's own schedule (DISCORD-SCHEDULE-1.a, REQ-discord-741; never the shell or runners, SAFE-3.a); posts and asks are otherwise unchanged.

A schedule the owner creates runs as the owner; schedules other people create stay read-only (DISCORD-SCHEDULE-1.a, REQ-discord-741): `SchedulerServiceOpts` gains optional `loadOwner` (`() => OwnerRecord | null`, sync or async), which the bridge wires to `loadOwnerConfig({ env, filePath: <allowlist source> })` and the daemon to `loadOwnerConfig({ env })`, so each run reads the owner as configured now (without it the start-time `owner`; a read that throws is logged `[scheduler] owner failed: …` and is no owner). `runOne`, after the DISCORD-SCHEDULE-3 gate, resolves the creator's role against that live owner (the SAFE-12 fence, the SAFE-13 scan and the answered-ask block use it too) and spawns with `actingIsAdmin: true` only when that role is owner and `isOwnerDiscord(liveOwner, createdByUserId)` (so not muted or deny-listed); every other schedule gets `actingIsAdmin: false`, and no schedule passes `actingRole`, so the spawn client stamps `owner` or `community`, never `team`. The run keeps its `schedule` surface and `schedule_<id>` session, so the SAFE-3.a gate still refuses the shell, runners and Fledge runs (REQ-agent-503), `createTaskExecute` discovers no Fledge plugin command (REQ-agent-741) and the repo gate stays on (DISCORD-SCHEDULE-3.a); the tool layer re-checks the owner at every call (REQ-plugins-065). A must-ask call the model starts (a `discord-post-message` included) goes through the Approve card like any owner run; a deny, a lapse or a resent deny ends the run blocked with a stuck ask naming the refused action (`mustAskRefusedAsk`, REQ-agent-741), which blocks the schedule (AUTONOMY-6.a, REQ-discord-606), so later due ticks are skipped with one wait note and raise no new card. The schedule's own posts (result, ask, wait note) go out through the scheduler's outbound, never through `runPlugin`, so they need no card (not AUTONOMY-10 announcements it starts). A non-git project still gets its own `scoped-talk-schedule_…` folder. No new env var, config key, slash option, table, column or schema version.

A Discord talk in a project that isn't a git repo works in the project folder itself (AGENT-1.a, REQ-discord-110): `SessionStore.bindWorktree` asks `ensureTalkWorkspace` for `nonGit: "project_dir"`, which hands back the folder (`kind: "project_dir"`) and makes no `.corvid-worktrees` base, scoped dir or branch; the row's kind is derived, not stored (`sessionWorkspaceKind`: branch ⇒ worktree, path = project by realpath ⇒ project_dir, else scoped_dir), so a restart re-binds in place, a legacy scoped-dir row of a non-git project (or an in-place row whose folder became a git repo) is parked and re-bound, and a switch is still refused. Park and remove never delete a dir that equals or contains the project folder by realpath (`guardsProjectDir`), whatever kind is passed; a git main checkout included. Only the owner's runs change files there (team work tools need a git work tree, REQ-plugins-115; the file tools never change the folder's root AGENTS.md / CLAUDE.md, REQ-plugins-110; SAFE-2, SAFE-3.a and the verify gate apply, REQ-agent-110). The owner's images go to `<project>/.corvidinho/attachments/<session id>/`, removed on every end path by `parkSessionWorktree` (`removeSessionAttachments`, strictly inside the project); anyone else's are URL-only (REQ-discord-013). Schedules pass `nonGit: "scoped_dir"` and keep their own scoped folder (AGENT-1.c). Concurrent talks in one non-git folder are not serialized (pending Leif). No new env var, config key, table, column or schema version.

A schedule reads and acts only on allowlisted repos, even public ones (DISCORD-SCHEDULE-3.a, REQ-discord-202): the scheduler builds each run's session id from `SCHEDULE_SESSION_PREFIX` (`schedule_<schedule id>`, `src/plugins/roles.ts`), which the spawn client writes to `CORVIDINHO_DISCORD_SESSION_ID`, so the tool layer's `isScheduleRunEnv` gates that run and its `delegate` / `council` workers to GitHub-allowlisted repos (REQ-plugins-496: the GitHub tools with no visibility lookup, `web-fetch` GitHub hops). `resolveProjectDir` takes `schedule: true` from `/schedule create` and from every tick (not from `/work`, `/session start` or start-up recovery): a directory inside the bridge root that lies in a git checkout nested there (its `--show-toplevel` is inside the root and is not the root) passes only when that checkout's `origin` OWNER/REPO passes the GitHub allowlist (deny wins; no origin or no allowlist ⇒ refused); the root's own checkout (or one enclosing it) and plain folders are unchanged. A refused create stores nothing; a stored schedule on such a checkout fails its tick through the REQ-discord-353 `project resolve failed` path (upgrade note in `docs/discord.md`).
When `memoryStore` is available on the bridge, every routed chat spawn SHALL
recall for `msg.authorId` (limit ~20) and prepend the inject block before
`agent.runChat`. Empty recall still prepends the empty one-liner. Missing store
or blank author id leaves the prompt unchanged. Bridge logs inject count.
No `/memory` slash command. The recall reads the speaker's declared person's
profile scope plus their Discord ids (`memoryInjectOptsFor`), never private
notes, and for an owner or team speaker (chat, button pick) appends the
project's memory block when it holds rows; owner / team `/work` runs start
with that project block (REQ-discord-101). Each block is searched for the
human's message (the picked label, the `/work` description): the rows
relevant to it first, then the newest (MEMORY-9, REQ-discord-067).
Module-owned tables in the shared DB (e.g. `spend_ledger` and `spend_alerts`
from `src/agent/spend.ts`, REQ-discord-098; `discord_session_turns` from
`src/discord/session-thread.ts`, REQ-discord-072) are created with CREATE
TABLE IF NOT EXISTS without a schema version bump, and their free-text columns are
scrubbed on write and listed in `SCRUB_TARGETS` (SAFE-6); `spend_alerts` holds
a constant kind, integers and its cap `scope` (`total` / `provider:<id>`,
SAFE-14; added by an idempotent ALTER, scrubbed on write and in
`SCRUB_TARGETS`), and a re-scrub skips a listed column an older module-owned
table does not have yet.
`openCorvidinhoDb` sets busy_timeout 5000 and foreign_keys on, then runs the
migration and `ensureScrubbed` in one transaction that takes the write lock
up front (REQ-discord-287): only its BEGIN IMMEDIATE goes through
`retryWhileBusy`, tried every millisecond until busy_timeout has passed, so
an open needs one free moment (not one per statement) and other processes
committing back to back cannot pass it over for the whole busy_timeout, as
SQLite's back-off (one try per 100 ms) did. Holding the lock, the body and
the COMMIT run under busy_timeout and no statement fails part way with
SQLITE_BUSY. (In a deferred transaction a write after a read fails with it
at once; the migration's ignored ALTER errors and multi-statement execs,
where bun reports only the last statement's error, went on past it, and
opens of a new file or with a re-scrub due failed together.)
`retryWhileBusy(db, fn)` sets busy_timeout 0 while `fn` runs and restores it
after; `fn` must be one statement or a BEGIN IMMEDIATE that leaves nothing
behind when it fails with SQLITE_BUSY; with busy_timeout 0 it runs `fn` once.
Retained conversations live in `conversation_threads` (schema v13,
`SCHEMA_VERSION` 13, a forward-only migration after v12's `forget_requests`;
REQ-discord-472): `summary`
and the JSON `turns` are scrubbed on write and are `SCRUB_TARGETS`;
`participants` and `bot_message_ids` hold ids only; `project` is the Discord
session's project directory, so a session resumed from it works there again
(SESSION-WORKTREE-4); a record is never served and is purged 30 days after
its last update (a kept session's last activity).
The spend warning line and `/status` spend line are built from integer
amounts, never from child-written text; the spend-cap question is scrubbed and
mention-defanged like every ask.
Only the owner sees spend amounts and cap settings (SAFE-14.a): no channel
post — chat answer, split part, collapsed edit, fallback reply, slash owner
notice, `/work` PR line, schedule post or pending-ask post — and no one else's
`/status` carries an amount, a cap value or a setting name; they see only
"Work is paused for budget." (`SPEND_PAUSED_TEXT`), and `/status` shows them
that only while runs stop at the cap. The owner's answer footers keep tokens
and cost (DISCORD-15.a).
The answer footer names the configured model that answered, for everyone
(DISCORD-15.a), with `(fell back from …)` when the run's own chain failed over
(AGENT-11); a run that failed over is told to its requester by the answer's
closing note and to the owner by the `llm.fallback` log line, never by a DM
(REQ-discord-080).
Recording a SAFE-8 warning and delivering it are separate: whichever process
crossed 80% records it, and the bridge DMs it to the configured owner only
(`src/discord/spend-dm.ts`, after each run and on every scheduler tick),
claiming it in one IMMEDIATE transaction so two passes never repeat it and
handing it back when the DM does not go out. A cap stop's details reach the
owner by DM once per cap episode, with the channel ping. A spend-cap ask
never carries the "reply to answer" hint (a reply cannot lift the cap); it
pings the owner once per cap episode across chat, slash commands and
schedules. A slash run's owner ping is a fresh post (an edit of a deferred
reply may not notify), with allowed mentions limited to the owner.
An answer delivered by editing the thinking message (DISCORD-ASK-6/7) that
mentions anyone is followed by exactly one short fresh post, replying to that
answer, holding only those mentions and a one-line pointer, with allowed
mentions exactly those users (never `@everyone`, `@here` or roles); no user is
pinged twice in a turn (the slash owner notice post counts), a spend-cap ask
whose episode already pinged carries no owner mention, and a fallback reply
(already a fresh post) gets no extra post (REQ-discord-215).
A `/work` or `/session start` run that stopped to ask leaves its session
waiting on that ask exactly like a chat ask (a Choose-button ask when its
choices fit a short list, else free text; never a spend-cap stop), and its
answer message is tracked like a chat reply, so a reply to it by the
requester never goes unheard (AUTONOMY-1/5/6 / DISCORD-ASK-1/4 /
REQ-discord-044).

Untrusted text on Discord (SAFE-11/12/13, REQ-discord-071): the IDENTITY-4
block shows the acting user's Discord display name / username only after
`cleanDisplayName` (a declared person's display and the owner map display are
the owner's and shown as configured), and when that shown Discord name reads
like the owner's display or another declared person's display or nickname
(`namesLookAlike`) it adds one `name_clash` line saying this Discord user id
is someone else; recognition and role stay on declared ids only (IDENTITY-7 /
IDENTITY-12). Chat, `/session start`, `/work` and an answer typed in an ask's
private Answer form resolve the speaker's role before the run: for team and community, `inboundInjection` runs over the
speaker's own text, and a hit starts no run — chat: one public reply
(`formatInjectionRefusal`, allowed mentions the owner only, replying to the
message; a session the message started is ended and the turn is not
recorded); slash: the interaction's public refusal, then a fresh channel post
pinging only the owner (`refuseInjectedSlash`; no session, worktree or work
task); Answer form: as the same words in a chat reply in that session — the
ask and session stay, the submit gets an ephemeral refusal and the owner one
post in the session's channel replying to the stub that pings only them
(`refuseInjectedAnswer`) — plus an `injection-suspected` / `denied` audit row
(actor, surface `discord:<session>` or `discord:/<command>`, digest of the
source and reason ids; never the text). Otherwise the team / community speaker's words go to
the model through `fenceSpeakerText` (the owner's unchanged), and so does the
label of a Choose option a team / community presser picks (`ask-pick`, fenced
but not scanned, SAFE-12.a). A run whose
result carries `injection` pings the owner on the post that carries its
answer: chat and button-pick replies (`withInjectionNotice`), `/session
start` and `/work` owner notices (`slashOwnerNotice`) and a schedule run's
result post or ask post. Replayed session turns strip invisible characters and
mark a line that imitates a Corvidinho block or a turn label (`Human:`,
`You (Corvidinho):`) `(quoted)`; recalled memory lines strip invisible
characters. No new env var, config key, table or column.

GitHub by numeric id only (IDENTITY-7.a, REQ-discord-367): no GitHub login —
a person's `github_logins`, the `[owner]` / env `github_login` — ever
identifies anyone; on GitHub the owner is recognised only by `[owner]
github_id` and a declared person only by `github_ids`. A login-only entry
still loads and matches on Discord. `/admin people link github:<login>` looks
the numeric id up once (GitHub API, owner-only, audited) and stores it; a
failed lookup writes nothing.

A failed run's reply (DISCORD-3.b, REQ-discord-032) is never the old
`session <id> failed (exit N)` line and never the run's summary (model text):
the owner's own run gets one plain line saying why, anyone else gets
`FAILED_TOLD_OWNER_TEXT` only after the owner was DMed that line (else
`FAILED_TEXT`), and every failure logs the scrubbed line. The line is harness
text only, SAFE-6 scrubbed before it is cut, and carries no spend amounts;
the `state=` / `verified=` / `attempts=` plumbing stays in the footer.

While fewer than 20 held replies were approved, no model text reaches a
public thread before the owner's Approve on a plain `reply` card (AUTONOMY-10
/ 10.a, REQ-discord-099): the bridge asks the gateway at post time (a failed
lookup is public), shows only the fixed hold line meanwhile, and posts
exactly the text the card showed; a deny, a lapse, a stop or the bridge
closing posts none of it, opens no question and does not count; with no
owner nothing waiting is posted. Fixed harness text never waits.

The bridge-live note after a restart is system text, not an announcement it
starts (AUTONOMY-10.b, REQ-discord-024): it goes out at `ClientReady` only to
the announcements channel with no Approve card, no hold line and no wait,
never counts toward the 20, and carries only the fixed REQ-discord-025
template (no model call, no model text).

Once a session question's buttons expire, the session stops waiting and the
requester's next message runs normally; a schedule's questions still wait
until answered (AUTONOMY-6.b, REQ-discord-044 / REQ-discord-045). A session's
button ask (chat, `/work`, `/session start`) keeps the session waiting only
for its ~30 minutes (`ASK_BUTTON_TTL_MS`, kept with the stored ask across a
restart): past them the next message that is not a cancel drops it and runs
as ordinary chat, with no prior-question block (only a thin reply, while an
earlier button ask of the session is still live, restates that one instead,
SESSION-MULTI-3). A schedule's ask has no expiry: its controls take presses and its
schedule's due runs stay skipped until it is answered or cancelled
(AUTONOMY-6.a, REQ-discord-606).

## Behavioral Examples

### Scenario: Its first public-thread replies wait for the owner's OK (AUTONOMY-10 / 10.a)

- **Given** an owner is configured, fewer than 20 public-thread replies were approved, and someone mentions the bot in a public thread (a forum post), its parent channel allowlisted
- **When** the run answers with a clarify question, the owner denies the card, and later a run answers and the owner approves
- **Then** while each waits the progress message shows `⏳ waiting for the owner's OK before replying here` and the owner gets a plain `reply` card with the reply verbatim before it; the denied one ends as `Not posted — the owner didn't OK this reply.` with no question pending and nothing counted; the approved one is posted exactly as the card showed and the count becomes 1; a failed run's line, a spend-cap stop and `⏹ Stopped` post at once without a card; after 20 approvals replies there go out at once

### Scenario: A stranger's run fails; the owner is told why (DISCORD-3.b)

- **Given** an owner is configured and the model provider answers 401
- **When** someone else's chat run fails, and then the owner's own run fails
- **Then** their answer is `That didn't work — the owner has been told.` and the owner gets one DM `❌ A run failed (chat in <#channel>): The model call failed (401 Unauthorized from <host>)`; the owner's own answer is that line; the same reason within the hour sends no second DM; each failure logs `[discord] run failed (chat, exit 1): …`

### Scenario: A schedule's question makes its next runs wait until it is answered or cancelled (AUTONOMY-6.a)

- **Given** an hourly schedule in an allowlisted channel whose run stopped with a clarify question listing two choices
- **When** the next hours come due before anyone answers, and then the schedule's creator presses **Choose** and picks one
- **Then** the question's post carries **Choose** and **Cancel**; each due hour is skipped (no run, not made up later) and one note says the schedule is waiting, pinging nobody; a reply to the post does not answer it; the pick closes the question privately ("Got it — **SQLite**…"), and the next hour's run gets the question and the pick; someone else's press gets "This choice isn't for you (or it was already answered)", and a spend-cap stop would have offered the owner's **Continue** and **Cancel**

### Scenario: A schedule on a nested checkout off the allowlist is refused (DISCORD-SCHEDULE-3.a)

- **Given** the bridge root holds `vendor/linux`, a git checkout whose origin is `github.com/torvalds/linux`, and the GitHub allowlist is `CorvidLabs`
- **When** the owner runs `/schedule create … project:vendor/linux` (or a schedule stored earlier with that project comes due)
- **Then** the create replies `not authorized` and stores nothing (the tick fails with `project resolve failed: … not authorized`, no agent run, no worktree); `/work project:vendor/linux` and a schedule on `vendor/fledge` (origin `CorvidLabs/fledge`) are unchanged

### Scenario: Stop a run; the message sent meanwhile still runs (AGENT-3.a / AGENT-3.b)

- **Given** a user's thread session whose run is going, and a second message they sent in the thread meanwhile
- **When** they send `stop` in the thread
- **Then** the second message is still waiting (no second run, no second progress message); the run's process tree is killed, the stop gets `⏹ Stopping the run.`, the first progress message becomes `⏹ Stopped` with the model and time in its footer (tokens and cost too if they are the owner); then the second message runs in the same session with its own progress message, and `⏹ Stopped` is in the thread it replays

### Scenario: Press Stop on a run's progress message (AGENT-3.a)

- **Given** a user's run whose progress message shows a red `Stop` button
- **When** someone else presses it, and then the user (or the owner) presses it
- **Then** the other person gets only the private `This Stop button isn't for you.` and the run goes on; the user's press gets the private `⏹ Stopping the run.`, the run's process tree is killed, the progress message becomes `⏹ Stopped` with its footer and no button, and a message they sent meanwhile then runs with its own progress message and button

### Scenario: Stop a scheduled run from Discord (AGENT-3.c)

- **Given** someone's schedule with a channel whose run the bridge started, its progress message `⏳ Schedule **<name>** … running.` showing a red `Stop` button
- **When** a third user presses it, and then the schedule's creator (or the owner) presses it — or replies `stop` to it
- **Then** the third user gets only `This Stop button isn't for you.` and the run goes on; the creator's press gets the private `⏹ Stopping the run.`, the run's process tree is killed, the progress message becomes `⏹ Stopped` with no button and nothing else is posted; the run row is `failed` / `stopped` / `stopped on Discord by <creator>` with no question, the schedule is still active with its failure count unchanged, and its next due run goes ahead and posts its result as before (its own progress message is removed when it ends)

### Scenario: Spawn with seeded identity

- **Given** a MemoryStore row `person/identity` for Discord user U
- **When** U sends a chat message the bridge routes to the agent
- **Then** the agent prompt starts with the Corvidinho memory header and a
  `- person/identity: …` bullet, and the bridge logs a non-zero inject count

### Scenario: A side-chat ask keeps the earlier Choose buttons (SESSION-MULTI-3)

- **Given** user U has an open Choose ask A ("Which DB?") in a chat session
- **When** U keeps chatting and that run asks again (Choose ask B, or a free-text ask)
- **Then** B becomes the session's pending ask, A's Choose button still opens
  its choices, and picking one resumes the session with A's question and the
  chosen label while B stays open; a late press on A gets `that choice expired`
  and clears only A; `cancel` clears both

### Scenario: An open ask never keeps a secret at rest (SAFE-6)

- **Given** a run asks "Which token? ghp_…" with the choices "keep sk-ant-…" and "drop it"
- **When** the session saves the open ask, or an older build's raw row is re-scrubbed on the next DB open after `SCRUB_RULES_VERSION` rises
- **Then** `discord_sessions.pending_ask` holds `[redacted:github-token]` and
  `[redacted:anthropic-key]` in valid JSON, with the same askId, option ids,
  expiresAt and stubMessageId, so the Choose button still opens the choices

### Scenario: A secret the cut would split is redacted, not cut (SAFE-6.a)

- **Given** a run asks with a choice label whose fake key starts near the
  80-character cut, or a question whose fake key starts near the 1500 cut
- **When** the ask is made, posted, stored, or reloaded after a restart
- **Then** the Choose-pick button, the Answer stub and form, a restated ask,
  a schedule ask post, `discord_sessions.pending_ask` and
  `schedule_runs.ask_question` show `[redacted:github-token]`, never a raw
  `ghp_` piece shorter than the scrub pattern; option ids are unchanged

### Scenario: A secret-looking option id never reaches a button or the row (SAFE-6)

- **Given** a run asks with an option whose id is an AWS key id
- **When** the ask is made and its session saved
- **Then** that option's id is its position (`2`), so neither the button
  custom id nor `discord_sessions.pending_ask` carries the key; an older
  build's row that stored it is redacted by the re-scrub, other ids unchanged

### Scenario: The owner approves a forget request on a DM card (MEMORY-ACL-6)

- **Given** a declared person asked `memory-forget-me` in a conversation
- **When** the next delivery pass DMs the owner the Approve/Deny card and the owner presses Approve before it lapses
- **Then** a SAFE-5 `started` row is written, every memory row of that person (profile, notes, private notes, superseded history, rows under their Discord ids) and their session turns are deleted in one transaction with the ask closed `approved`, the card shows the outcome without buttons, and the asker is told by DM (else in their allowlisted conversation); the people list and project memory are untouched

### Scenario: The owner starts a forget for a declared person with /admin (MEMORY-ACL-6.a)

- **Given** a declared person with memory, and the owner's own memory under their Discord id
- **When** the owner runs `/admin people forget person:<id>` and later presses Approve on the DM card it sends
- **Then** `admin-people-forget` `started` / `ok` rows are written, nothing is deleted before the press, and Approve deletes that person's memory and session turns but never the owner's, and nobody else is DMed

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

### Scenario: The owner denies a GitHub repo and a Discord role at runtime (ADMIN-3.c)

- **Given** an allowlist file with `[github] orgs = ["corvidlabs"]`, a
  `[corvidinho.plugins]` table and the owner invoking from an allowlisted
  channel
- **When** the owner runs `/admin deny add github_repo:corvidlabs/secret`,
  then `/admin deny add role:@R`, then `/admin deny add user:@<themselves>`
- **Then** `[github].deny_repos` and `[discord].deny_roles` gain the entries
  (every other line, `[corvidinho.plugins]` included, kept), the repo gate and
  the actor gate refuse them at once without a restart, each change writes
  `admin-deny-add` `started` + `ok` rows, and the last command is refused
  (`denied`) because it would lock the owner out

### Scenario: The owner mutes a member with /admin mutes, then unmutes them with the /unmute alias (ADMIN-3.c)

- **Given** an owner configured, an audit trail wired and a member M in an
  allowlisted channel
- **When** the owner runs `/admin mutes add user:@M`, M sends an @mention,
  then the owner runs `/unmute user:@M` and `/mute user:@<themselves>`
- **Then** M is muted at once (M's @mention gets the one `MUTED` notice and no
  run), the reply says the mute is in memory until the bridge restarts and
  points to `/admin deny add user:` for a lasting block, the unmute serves M
  again, the trail gains `admin-mutes-add` `started` + `ok` then
  `admin-mutes-remove` `started` + `ok` (the alias writes the same rows), and
  the self-mute is refused (`denied`) with the mute set unchanged

### Scenario: A non-owner types into /admin channels remove

- **Given** an owner configured and a guild member who is not the owner in an
  allowlisted channel
- **When** that member focuses the `channel` option of `/admin channels
  remove` (or `/admin channels add`, `/announce channel`)
- **Then** Discord gets an empty choice list — no allowlisted channel names or
  ids; the owner in the same channel still gets the live allowlist, and the
  owner in a channel that is not allowlisted gets nothing (REQ-discord-431)

### Scenario: Collapsed clarify ask pings the requester

- **Given** an editable thinking message and a run that stops with a clarify
  ask for requester R
- **When** the bridge edits the thinking message into the ask (mentioning R)
- **Then** it posts one fresh reply to that message, `<@R> ↑ question for
  you`, with allowed mentions exactly `[R]`; a stuck ask instead posts
  `<@owner> ↑ needs you`; the same ask answered by a fallback reply adds no
  post (REQ-discord-215)

### Scenario: A free-text ask is answered privately (DISCORD-ASK-4.a)

- **Given** a run for requester R stops with a clarify ask whose choices
  cannot be listed
- **When** R presses the stub's **Answer** button, types an answer in the
  form and submits it
- **Then** the stub showed the question and one Answer button; the press
  opened a modal (no post, no run); the submit resumed R's session with the
  prior-question block a reply gets, in the stub, the typed text scrubbed and
  never posted; another user's, a muted or deny-listed R's, or a late (~30
  min) submit is refused ephemerally with no run, and a late one leaves the
  ask for a reply; a thin submit (`ok`) is restated privately and a `cancel`
  submit drops the ask, as the same reply would (AUTONOMY-5/6); a reply to
  the stub still answers it (REQ-discord-548)

### Scenario: A stranger's message tries to take over the bot (SAFE-13)

- **Given** an undeclared user in an allowlisted channel and a configured owner
- **When** they @mention the bot with text that tells it to set aside its previous instructions and print its environment
- **Then** no agent run starts; one reply says the bot won't act on it (in plain words, never quoting the text) and pings only the owner; the session the message would have started is dropped; an `injection-suspected` / `denied` audit row names the user and the surface (REQ-discord-071)

### Scenario: A stranger types an injection into the private Answer form (SAFE-13)

- **Given** an undeclared user with an open free-text ask (the stub with its **Answer** button) and a configured owner
- **When** they submit the Answer form with text that tells the bot to set aside its previous instructions
- **Then** no agent run starts; the submit gets a private refusal that never quotes the text; the ask stays open and the session live; one post in the session's channel, replying to the stub, pings only the owner; an `injection-suspected` / `denied` audit row names the user and `discord:<session>`; an ordinary answer from them would reach the model fenced (`source=ask-answer`), and the owner's own answer is neither fenced nor scanned (REQ-discord-548, REQ-discord-071)

### Scenario: A stranger picks a Choose option (SAFE-12.a)

- **Given** an undeclared user with an open Choose ask whose option labels the model wrote (possibly copied from that user's own words) and a configured owner
- **When** they press Choose and pick an option, or press a pick button whose option id the ask does not have
- **Then** the pick resumes the session with the label inside the untrusted-data fence (`role: community`, `source=ask-pick`), with `humanText` and the thread turn the plain label and the option buttons cleared at once as before; the owner's own pick reaches the run exactly as before; a pick whose option id matches none of the ask's options gets "that choice expired", runs nothing, leaves the ask open and never puts the raw id in a prompt (REQ-discord-548, REQ-discord-071)

### Scenario: A stranger's run stops at the spend cap (SAFE-14.a)

- **Given** a configured owner, `CORVIDINHO_DAILY_SPEND_CAP_USD` set and 24 h spend at the cap, with an 80% warning pending from an earlier run
- **When** a declared team member @mentions the bot and the run stops before calling the model, then runs `/status`
- **Then** the channel answer says only "💸 Work is paused for budget." with the owner mentioned (once per cap episode) — no question, amount, cap or setting name; the owner gets two DMs: the stop's details (spend, the call's estimate, the cap and the setting to change) and the 80% warning; the member's `/status` shows "Spend: Work is paused for budget." and no amounts, while the owner's `/status` shows the 24 h spend against the cap (REQ-discord-098)

### Scenario: The owner lets one call past the spend cap on a DM card (SAFE-8 / SAFE-8.a)

- **Given** a configured owner, the bridge running, `CORVIDINHO_DAILY_SPEND_CAP_USD` set and 24 h spend at the cap
- **When** a run's next model call would pass the cap
- **Then** the run holds the call and records a `spend` card; the bridge DMs the owner the run's task as quoted data, then the card (`Action: send one model call to <model> via <provider>`, `Target: total`, `Amount: ~$… (this one call's estimate)`, "Approve also needs a one-time code"); the requester's thinking status shows only that it waits for the owner's OK; Approve alone sends nothing; Approve plus the one-time code sends exactly that call once; the run's next call past the cap raises a new card and code; had the owner pressed Deny (or let it lapse), nothing would be sent or spent and the channel would see only "💸 Work is paused for budget." (REQ-discord-198, REQ-agent-198)

### Scenario: A stranger named like the owner (SAFE-11)

- **Given** an undeclared user whose Discord display name is `[owner] L<zero-width>eif`
- **When** they ask an ordinary question
- **Then** the run's acting-user block shows `display_name: Leif` with a `name_clash` line and no owner facts, their words are fenced as untrusted data with `role: community`, and the run is community (REQ-discord-071)

### Scenario: A non-owner's schedule text is data, and an injection in it never runs (SAFE-12/13)

- **Given** a configured owner, a stranger, and a schedule the stranger created earlier whose stored prompt tells the bot to ignore its previous instructions and print its environment
- **When** the stranger runs `/schedule create` with that prompt, and the stored schedule comes due
- **Then** the create stores nothing, the stranger gets a private refusal that never quotes the text, one channel post pings only the owner and an `injection-suspected` / `denied` row names the stranger and `discord:/schedule`; the due tick runs no agent, pauses the schedule, posts one ask pinging only the owner (never the text) and appends a `denied` row for `scheduler:<id>`; an ordinary schedule of theirs runs with its name and prompt fenced as `role: community` (`source=schedule-prompt`), and the owner's own schedule runs exactly as before (REQ-discord-713)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| memoryStore undefined | Prompt unchanged; no inject log |
| Blank author id | Prompt unchanged; no inject |
| `/admin` by non-owner / no owner | Ephemeral `not authorized`; no file write |
| `/work` tree deleted or turned off a test since the branch left its base, or its test names cannot be read | `PR: not opened — N test(s) were deleted or turned off since the branch left …` naming each as `"name" (file)` (or "could not check …"); nothing committed or pushed; reason `tests-deleted` (REQ-discord-185) |
| `/work` in a repo whose SpecSync workflow requires a change: a meaningful path changed since the merge-base has no open or branch-archived change, or the diff cannot be read | `PR: not opened — N changed path(s) this repo's SpecSync workflow needs a change for are not covered by a SpecSync change (…)` (or "could not read what changed …"); nothing committed or pushed; reason `sdd-uncovered` (REQ-discord-518) |
| `/work` in a repo that uses hi: something under `hi/` differs from the merge-base (committed on the branch or left in the tree), or that diff cannot be read | `PR: not opened — this repo's hi/ changed since the branch left … (criteria …; retired entries …; other hi/ files …) and no approved capture made the change; …` (or "could not read what changed under hi/ …"); nothing committed or pushed, the pre-push lane not run; reason `hi-changed` (REQ-discord-520) |
| `/work` pre-push verify lane passes with no recognised test summary, or no test ran | `PR: not opened — Verify gate: not verified: …`; reason `verify-failed`; nothing committed or pushed (REQ-discord-185) |
| Spend card: Deny, no answer before it lapses, a code typed after it lapsed, a non-owner's press or code, or its waiting run is gone | nothing is sent or spent; the card closes as a no (`Denied by you — nothing was spent.` / `Expired — …` / `Closed — nobody is waiting …`); a non-owner gets `Only the owner can answer this card.` (REQ-discord-198) |
| A run fails (non-zero exit without an ask, or the spawn throws) on chat, an ask pick / Answer resume, `/session start`, `/work` or a schedule post | Owner's own run: one plain scrubbed line why; anyone else: `That didn't work — the owner has been told.` after the owner DM went out, else `That didn't work.`; one `[discord] run failed (<surface>, exit N): <reason>` line (`[scheduler] …` for schedules) (REQ-discord-032) |
| The owner DM about a failed run fails, or no owner / no DM path | The reply says only `That didn't work.`; the DM is not remembered, so the next failure with that reason tries again (REQ-discord-032) |
| Stuck WATCH ask with no owner Discord id or no live gateway DM | left pending, not sent; given up with a log line after a day (REQ-discord-086) |
| Owner DM for a stuck WATCH ask fails (DMs closed) | ask handed back; retried after 10 minutes; one log line per try (REQ-discord-086) |
| Channel autocomplete by a non-ADMIN, a muted or deny-role owner, outside an allowlisted channel, or with no owner | Empty choice list; no channel names or ids (REQ-discord-431) |
| Channel autocomplete gate unset or throws | Empty choice list (fail closed); a throw is logged |
| `/admin` on unreadable/unparsable file | Ephemeral refusal naming the path; file untouched |
| `/admin` audit trail unavailable | Ephemeral refusal (SAFE-5 fail closed); nothing changed |
| `/admin mutes add|remove`, `/mute` or `/unmute` with the audit trail throwing or not wired | Ephemeral `Refused: audit log unavailable (SAFE-5)`; the mute set unchanged (REQ-discord-010) |
| `/admin mutes add` or `/mute` of the owner or of the caller | Ephemeral `MUTE_SELF_OR_OWNER_REFUSED`; one `admin-mutes-add` `denied` row; the mute set unchanged (REQ-discord-010) |
| `/mute` / `/unmute` handler reached by a caller who is not ADMIN (past the dispatcher floor, or no owner configured) | Ephemeral `not authorized`; one `admin-mutes-*` `denied` row (route-only digest, as the `/admin` re-check's); the mute set unchanged and no mute state told (REQ-discord-011) |
| `/admin people link github:<login>`: the GitHub lookup fails, times out, finds no user or answers for another login | Ephemeral refusal naming why (HTTP status only) and suggesting `github_id:<number>`; nothing written; one `admin-people-link` `error` audit row (REQ-discord-367) |
| A GitHub actor whose login is the owner's or a declared person's but whose numeric id is missing or not declared | Resolves nobody (undeclared, community), never the owner (REQ-discord-367) |
| `/schedule delete` audit trail unavailable (throws, keyed chain without the key, or no DB) | Ephemeral `Refused: audit log unavailable (SAFE-5)`; schedule and run history kept |
| `/schedule create` cadence with a zero cron step (`*/0`, `a-b/0`, `n/0`, any field, also in a comma list) | Ephemeral `Invalid cron step in "PART": the step must be 1 or more.`; nothing created; the bridge keeps answering (REQ-discord-020) |
| Leftover in-flight reply, embed edit fails or no embed id | Reply to the request message with the interrupted text; row deleted |
| Leftover in-flight reply, edit and reply both fail | Logged as unreachable; row deleted; bridge start continues |
| Leftover in-flight reply in a channel no longer allowlisted, or whose thread or parent is deny-listed | Nothing edited or posted; logged as skipped; row deleted |
| Message, ask button press or slash command in a thread on `deny_channels` under an allowlisted parent (or a message, or an ask press for a session a message started, in a thread under a deny-listed parent) | MessageCreate: silent refuse; interaction: ephemeral zero-width ack (allowlist tip for an admin); no session, run or post (REQ-discord-212) |
| In-flight row write fails (DB busy) | Warning logged; the reply itself still runs |
| 'stop' / 'cancel' with no run of the session in flight | Unchanged: 'cancel' clears the open asks with the short ack; 'stop' is an ordinary message (REQ-discord-302) |
| 'stop' reply to a running progress message from anyone but its requester or the owner, or in another channel | Not a stop: routed as before (no mention ⇒ ignored) and the run goes on (REQ-discord-302) |
| A second 'stop' while the run winds down | Same short ack; nothing aborted again; one `⏹ Stopped` (REQ-discord-302) |
| Stop button pressed by anyone but the run's requester or the owner | Ephemeral `This Stop button isn't for you.`; the run goes on (REQ-discord-303) |
| Stop button of a run that is not running on that message (finished or stopped run, another run's id, another channel, a button from before a restart) | Ephemeral `Nothing is running.`; nothing stopped (REQ-discord-303); the owner's press of such a button in a DM (a schedule run's, AGENT-3.c) skips the channel gate and gets the same reply (REQ-discord-304) |
| Stop button pressed off the allowlist, by a deny-listed or unlisted user, or while muted / rate-limited | The ask press refusals (zero-width ack, the owner's allowlist tip, `MUTED` / `RATE_LIMITED`), all ephemeral; nothing stopped (REQ-discord-303) |
| A form submit carrying a `cvstop:` id | Ignored: no reply, nothing stopped (REQ-discord-303) |
| A schedule run's Stop button pressed by anyone but the schedule's creator or the owner | Ephemeral `This Stop button isn't for you.`; the run goes on (REQ-discord-304) |
| A schedule with no channel and no owner configured, or the owner's DM (or its button edit) does not go out; a schedule run the daemon claimed | No Stop control: the run goes on and ends as before (a sent DM whose button could not be added is deleted) (REQ-discord-304) |
| The Stop control's `begin` throws | Logged `[scheduler] stop control failed: <scrubbed line>`; the run goes on without one (REQ-discord-304) |
| A waiting message's session ended, idled out or its requester was forgotten before its turn | Nothing runs or is posted; its in-flight row is cleared (REQ-discord-301) |
| A waiting message's author (or a waiting pick's presser) was muted or deny-listed, or its channel dropped from the allowlist or deny-listed, before its turn | Nothing runs or is posted; its in-flight row is cleared; the rate limit is not counted again (REQ-discord-301) |
| A 'stop' lands after the `/work` agent exited, before its PR step | Short ack; no PR (`PR: not opened — the run was stopped.`), task `failed` / `stopped` (REQ-discord-302) |
| Bridge stop with a run going and messages waiting | The run's tree is killed and nothing is posted; nothing waiting starts; their in-flight rows stay for the next start's interrupted notice; a `/work` stays `running` until restart recovery fails it (REQ-discord-301) |
| Collapsed-answer ping post fails or throws | Nothing retried; the collapsed answer stays and the turn (or slash run) finishes normally; claims already taken are kept |
| `discord-post-message` in a bridge-started run: `--requesting-user-id` names another user, or the acting user's requester check cannot run (Guild Members login refused / timeout / throw) | Refused, exit 3, nothing posted; the check failure is one scrubbed line naming Server Members Intent, no token value (REQ-discord-012) |
| `discord-send-file`: `--channel` given, no conversation channel or acting user, channel not allowlisted (neither the thread nor its parent listed, or a deny on the thread or on the parent the bridge set), SAFE-2 / secret path (by name, link target, or a file or folder swapped for a link after the checks), path outside the project, type not allowed or bytes not matching, over 8 MB (at the size check or in the bytes read; at most 8 MB + 1 byte is read), requester cannot view / send / attach or the check cannot run, empty or secret-touching `--git-diff` | Refused, nothing uploaded (REQ-discord-476) |
| `discord-send-file`: Discord answers 413 / code 40005 (the server's limit is lower) | Refused with the server-limit reason, not retried (REQ-discord-476) |
| A retained-conversation read or write fails (DB busy) | Warning logged (`[discord] conversation … failed`); the run goes on without the summary write or the resume (REQ-discord-472) |
| A reply to an expired session's answer by another user, or a plain message in the thread from someone whose conversation is not there | No resume: routed as before (no mention ⇒ ignored; a mention starts their own session with nothing replayed) (REQ-discord-472) |
| `CORVIDINHO_LLM_CONTEXT_TOKENS` unset, not a positive integer, or below 1024 | 8192 (unset / invalid) or 1024 (too small) (REQ-discord-472) |
| Gateway login rejected (401 `TokenInvalid` / 403) or unreachable | Half-started client stopped; `startBridge` returns `{ ok: false, exitCode: 1 }` with `discord login failed (<status>): check DISCORD_TOKEN (<line>)`; no crash dump, no token value |
| Non-owner chat message, `/session start` topic or `/work` description trips the SAFE-13 detector | No run, no session / worktree / work task; one short public refusal; the owner pinged (chat: in the reply; slash: a fresh channel post); `injection-suspected` audit row (REQ-discord-071) |
| SAFE-13 refusal with no owner configured | The refusal still goes out and says no owner is configured; `INJECTION_NO_OWNER_WARNING` logged (REQ-discord-071) |
| SAFE-13 audit trail unavailable (no DB, keyed chain without the key) | Refusal still sent; one `[discord] SAFE-13 audit row failed` warning (REQ-discord-071) |
| `/schedule create` project, or a due schedule's project, inside the bridge root but in a nested git checkout whose origin is off the GitHub allowlist (or has none) (DISCORD-SCHEDULE-3.a) | Create: ephemeral `Project refused: not authorized …`, nothing stored. Tick: run failed `project resolve failed: …`, stuck ask, no worktree or agent run (REQ-discord-202 / -353) |
| Non-owner `/schedule create` name or prompt trips the SAFE-13 detector | Nothing stored; ephemeral refusal; one fresh channel post pinging only the owner; `injection-suspected` row, surface `discord:/schedule` (REQ-discord-713) |
| A reply with model text in a public thread while fewer than 20 were approved: the owner denies its `reply` card, lets it lapse (5 min), or the run is stopped / the bridge closes while it waits | Nothing of it is posted; the waiting message becomes `Not posted — …` (or `⏹ Stopped`); no question is left pending; the count is unchanged; a schedule post denied or lapsed is not retried, one the bridge stopped on is handed back (REQ-discord-099) |
| A reply with model text in a public thread and no owner configured, or no DB to raise the card | Nothing of it is posted (nobody can approve); no card (REQ-discord-099) |
| The gateway cannot look up whether the reply's channel is a public thread | It counts as one: the reply waits for the owner's OK (fail closed, REQ-discord-099) |
| A due schedule's stored non-owner name, description or prompt trips the SAFE-13 detector | No worktree, no agent run; one `[scheduler] SAFE-13: schedule <id> not run …` log line (reason ids, never the text); run recorded failed with a stuck ask (never the text); schedule paused; the ask pings the owner once through the usual ask path (a daemon tick leaves it pending for a bridge); `injection-suspected` row, surface `scheduler:<id>`, when a trail is wired (REQ-discord-713) |

## Dependencies

- MEMORY store (`src/memory`) / REQ-discord-021
- Agent spawn client (`agent-client.ts`)
- GIPHY media hosts (`plugins/gif/hosts.ts`, `hasGiphyMediaLink`) / REQ-discord-075

## Change Log

DISCORD-7 admin re-auth + DISCORD-8 confused-deputy (2026-09-26, corvid-agent + Merlin, #13).
DISCORD-9 image attachments + DISCORD-10 protocol lockstep (2026-09-26, corvid-agent image-attachments + Merlin protocol-version, #14).
| 2026-09-26 | discord-dogfood user lookup + mention rewrite + soft-land UX (REQ-discord-312 / IDENTITY-5 / DISCORD-13) |
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
| 2026-09-26 | audit-append-and-safe-6-re-scrub-take-the-sqlite-write-lock-up-front-begin-immediate-so-busy-timeout-applies-and: Audit append and SAFE-6 re-scrub take the SQLite write lock up front (BEGIN IMMEDIATE) so busy_timeout applies and concurrent writers wait instead of failing with database is locked (SAFE-5, SAFE-6) |
| 2026-09-26 | align-session-start-and-work-with-discord-ask-7-collapse-thinking-into-one-final-message-instead-of-done-embed-plus: Align /session start and /work with DISCORD-ASK-7: collapse thinking into one final message instead of Done embed plus interaction reply |
| 2026-09-26 | discord-ask-8-clear-ephemeral-choice-buttons-on-pick-and-delete-got-it-working-ephemeral-after-resume: DISCORD-ASK-8: clear ephemeral choice buttons on pick and delete Got-it Working ephemeral after resume |
| 2026-09-26 | bridge-marks-a-reply-interrupted-after-a-restart-in-flight-replies-are-recorded-in-the-shared-db-and-the-next-bridge: Bridge marks a reply interrupted after a restart: in-flight replies are recorded in the shared DB and the next bridge start edits the frozen progress embed to a failed interrupted status (or replies to the request message) instead of leaving it at working forever |
| 2026-09-26 | default-talk-worktree-ids-and-branch-names-include-a-digest-of-the-full-session-id-so-ids-sharing-a-16-char-prefix: Default talk worktree ids and branch names include a digest of the full session id so ids sharing a 16-char prefix never share a worktree |
| 2026-09-27 | a-talk-stored-with-a-prefix-only-worktree-name-before-the-digest-change-keeps-it-after-upgrade-and-a-new-talk-whose-id: A talk stored with a prefix-only worktree name before the digest change keeps it after upgrade, and a new talk whose id shares that prefix gets its own worktree |
| 2026-09-26 | safe-8-review-follow-up-for-pr-160-issue-98-a-post-that-did-not-go-out-hands-back-the-80-spend-warning-and-the-spend: SAFE-8 review follow-up for PR #160 (issue #98): a post that did not go out hands back the 80% spend warning and the spend-cap owner ping on every bridge surface (a slash reply that fails, e.g. an expired interaction token, still posts the owner notice), a warning claimed while spend is back under 80% stays pending for the next post at 80% or more, and a spend-cap stop is never kept as the session pending ask |
| 2026-09-27 | safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8: SAFE-8 x DISCORD-ASK-7 (issue #98, merge of #208): /work and /session start answer in one collapsed message and keep the SAFE-8 owner notice a fresh channel post; an ask run never shows Done, and claims go back when nothing carried the notice |
| 2026-09-27 | collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the: Collapsed ask pings notify: when an answer is delivered by editing the thinking message (DISCORD-ASK-6/7) and mentions the requester or owner, one short fresh post pings exactly those users (AUTONOMY-2/4, SAFE-8), without double pings |
| 2026-09-27 | a-work-or-session-start-run-that-stopped-to-ask-keeps-the-ask-as-the-session-s-pending-ask-and-its-answer-message: A /work or /session start run that stopped to ask keeps the ask as the session's pending ask and its answer message continues the session, so a thin reply restates the question, cancel clears it and a substantive reply resumes with the question as context (AUTONOMY-1/5/6, REQ-discord-044); a spend-cap stop is never pending |
| 2026-09-27 | discord-dogfood-member-user-lookup-for-snowflakes-identity-5-discord-13-soft-land-tool-round-exhaustion-without-dumping: Discord dogfood: member/user lookup for snowflakes (IDENTITY-5/DISCORD-13), soft-land tool-round exhaustion without dumping Stopped after N (AGENT-9), chat prefers prose over SpecSync/github thrash (ROLES-CHAT-9); package 0.0.28 |
| 2026-09-27 | thin-ack-gate-ignores-identity-5-mention-trailer-so-bot-ok-still-restates-pending-asks-follow-up-to-discord-user-lookup: Thin-ack gate ignores IDENTITY-5 mention trailer so <@bot> ok still restates pending asks (follow-up to discord-user-lookup soft-land) |
| 2026-09-27 | discord-6-rate-limits-and-mutes-discord-rate-limit-by-level-applies-to-chat-and-slash-via-the-actor-s-resolved: DISCORD-6 rate limits and mutes: DISCORD_RATE_LIMIT_BY_LEVEL applies to chat and slash via the actor's resolved permission level, /mute refuses the invoker and the configured owner, and a muted or rate-limited user gets at most one public MessageCreate notice per rate-limit window |
| 2026-09-27 | scope-session-list-to-the-acting-member-and-hide-host-paths-from-non-owners: Scope /session list to the acting member and hide host paths from non-owners |
| 2026-09-27 | discord-a-reply-or-forward-that-references-a-tracked-bot-message-never-continues-the-session-outside-an-allowlisted: Discord: a reply or forward that references a tracked bot message never continues the session outside an allowlisted channel (DISCORD-5, DISCORD-DENY-1) |
| 2026-09-27 | schedule-runs-never-stay-running-forever-bridge-stop-abandons-in-flight-runs-like-the-daemon-a-failed-run-outcome-write: Schedule runs never stay running forever: bridge stop abandons in-flight runs like the daemon, a failed run-outcome write is retried once then logged and counted failed, bridge and daemon start fail runs a dead process left running and remove leftover schedule worktrees, and stop waits a short bounded grace for aborted runs to park their worktree |
| 2026-09-27 | clean-cli-errors-a-failing-command-prints-one-scrubbed-line-plus-a-hint-and-exits-non-zero-instead-of-a-stack-trace-or: Clean CLI errors: a failing command prints one scrubbed line plus a hint and exits non-zero instead of a stack trace or Bun crash footer; discord bridge login failure exits cleanly naming DISCORD_TOKEN; github watch stops with exit 1 on a GitHub 401 |
| 2026-09-27 | replying-to-a-session-start-or-work-answer-continues-that-session-discord-2: Replying to a /session start or /work answer continues that session (DISCORD-2) |
| 2026-09-27 | daemon-claimed-schedule-asks-reach-discord-the-run-row-records-the-ask-and-the-bridge-s-scheduler-tick-posts-it-once: Daemon-claimed schedule asks reach Discord: the run row records the ask and the bridge's scheduler tick posts it once (AUTONOMY-2 / AUTONOMOUS-7 needs-human outbox) |
| 2026-09-27 | schedule-ticks-re-check-the-creator-against-the-live-discord-user-allowlist-and-the-daemon-ticks-against-the-live: Schedule ticks re-check the creator against the live Discord user allowlist, and the daemon ticks against the live allowlist (DISCORD-SCHEDULE-3) |
| 2026-09-27 | discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns: Discord sessions keep their thread: each run is stored with its session and a continued run gets the earlier turns replayed, bounded (AGENT-6) |
| 2026-09-27 | the-verify-gate-uses-the-run-s-real-git-working-tree-diff-not-only-the-files-tools-report-so-an-edit-made-outside-the: The verify gate uses the run's real git working-tree diff, not only the files tools report, so an edit made outside the file tools is verified before done (AGENT-4, #85) |
| 2026-09-27 | files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision: Files-read passes images to the model as image parts it can see, with a one-shot text fallback for models without vision (DISCORD-9) |
| 2026-09-27 | schedule-ask-outbox-delivery-re-checks-the-creator-and-channel-against-the-live-discord-schedule-3-gate: Schedule ask outbox delivery re-checks the creator and channel against the live DISCORD-SCHEDULE-3 gate |
| 2026-09-27 | discord-thread-sessions-are-keyed-by-thread-user-so-a-second-user-starting-a-session-in-a-thread-never-takes-over-the: Discord thread sessions are keyed by (thread, user), so a second user starting a session in a thread never takes over the first user's plain-message continuation (SESSION-MULTI-1/2) |
| 2026-09-27 | schedule-auto-pause-and-pre-run-failures-record-a-stuck-ask-on-the-run-row-so-the-owner-is-pinged-once-through-the: Schedule auto-pause and pre-run failures record a stuck ask on the run row so the owner is pinged once through the existing schedule ask post and the bridge delivery pass (AUTONOMY-2) |
| 2026-09-27 | discord-version-presence-rides-every-gateway-identify-via-the-client-presence-option-and-is-still-set-on-clientready: Discord version presence rides every gateway IDENTIFY via the Client presence option and is still set on ClientReady (DISCORD-12) |
| 2026-09-27 | safe-5-schedule-delete-appends-audit-rows-before-deleting-a-schedule-and-its-run-history-and-fails-closed-like-admin: SAFE-5: /schedule delete appends audit rows before deleting a schedule and its run history, and fails closed like /admin when the audit trail is unavailable |
| 2026-09-27 | discord-channel-autocomplete-for-admin-and-announce-returns-no-choices-unless-the-invoker-is-admin-in-an-allowlisted: Discord channel autocomplete for /admin and /announce returns no choices unless the invoker is ADMIN in an allowlisted channel |
| 2026-09-27 | work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free: /work and /session start answer an ask whose choices fit a short list with the chat's Choose stub and ephemeral pick, free text only when the options cannot be listed (DISCORD-ASK-1/4) |
| 2026-09-27 | discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per: Discord keeps an open Choose button ask when a later chat run asks again: pending asks are keyed by askId, not one per session (SESSION-MULTI-3) |
| 2026-09-27 | discord-button-pick-resume-injects-the-presser-s-display-name-and-username-like-a-chat-message-identity-4: Discord button-pick resume injects the presser's display name and username like a chat message (IDENTITY-4) |
| 2026-09-27 | the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the: The collapsed final answer keeps a footer-only embed with the model and state/verified/verifySkipped/attempts, while the Choose stub stays embed-free (DISCORD-3.a) |
| 2026-09-27 | open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks: Open Discord asks are secret-scrubbed before the session row is saved and the SAFE-6 re-scrub rewrites stored open asks as JSON (SAFE-6) |
| 2026-09-27 | discord-post-message-checks-the-acting-discord-user-the-bridge-set-not-only-a-model-supplied-id-discord-8: Discord-post-message checks the acting Discord user the bridge set, not only a model-supplied id (DISCORD-8) |
| 2026-09-27 | discord-an-ask-button-press-passes-the-actor-gate-and-mute-rate-limit-like-chat-and-slash-so-a-muted-or-deny-listed: Discord: an ask button press passes the actor gate and mute/rate limit like chat and slash, so a muted or deny-listed user cannot keep a session going by buttons (REQ-discord-201, REQ-discord-010, DISCORD-6, ALLOW-5) |
| 2026-09-28 | discord-outbound-posts-parse-no-mentions-from-model-text-so-untrusted-input-cannot-ping-roles-everyone-or-here-discord: Discord outbound posts parse no mentions from model text so untrusted input cannot ping roles, @everyone or @here (DISCORD-8) |
| 2026-09-29 | discord-send-file-attaches-files-and-images-to-replies-in-the-conversation-s-own-channel-and-the-model-is-told-it-can: Discord-send-file attaches files and images to replies in the conversation's own channel, and the model is told it can (DISCORD-17) |
| 2026-09-29 | nightly-sqlite-backup-to-a-directory-the-owner-sets-with-a-weekly-tested-restore-a-restore-command-and-a-once-per: Nightly SQLite backup to a directory the owner sets with a weekly tested restore, a restore command and a once-per-failure-streak owner notice (OPS-1/2, #68) |
| 2026-09-29 | declared-people-the-owner-declares-who-s-who-in-the-allowlist-file-corvidinho-recognises-the-owner-and-each-declared: Declared people: the owner declares who's who in the allowlist file, Corvidinho recognises the owner and each declared person on Discord and GitHub by stable ids only, and only the owner changes people and links with audited /admin people (IDENTITY-13/14/6/7, ADMIN-3.a, #36) |
| 2026-09-29 | three-roles-owner-team-and-community-gate-every-tool-each-declared-person-has-one-role-set-only-by-the-owner-role-key: Three roles: owner, team and community gate every tool. Each declared person has one role set only by the owner (role key or audited /admin people role); the tool layer re-resolves the actor's role from the people registry on every run and surface (runPlugin + catalog): owner keeps everything, team gets /work edits and PR, GitHub reviews and comments on allowlisted repos and only their own memory, community (and anyone undeclared, WATCH, schedules, workers) keeps today's read/chat tools; community site/roadmap sources are the public repo docs and the public issues and milestones of allowed public repos (IDENTITY-8..12, ADMIN-3.b, ROLES-CHAT-8.a, #65) |
| 2026-09-29 | person-and-project-memory-private-notes-and-forget-me-on-an-owner-approve-deny-card-each-declared-person-keeps-one: Person and project memory, private notes, and forget-me on an owner Approve/Deny card: each declared person keeps one profile keyed by person id (role, projects, preferences, history of decisions, asks and approvals), each project keeps memory keyed by its repo for whoever works on it next, a person's memory and private notes are shown only to them and the owner on every surface, and anyone can ask to be forgotten, which deletes their memories once the owner approves on a DM Approve/Deny card (MEMORY-5/6/7, MEMORY-ACL-6, #101) |
| 2026-09-29 | memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run: Memory on Discord and GitHub, filed by person or project, and a memory search before I don't know: a GitHub WATCH run saves and recalls for the commenter's declared person (people list, stable GitHub ids) with MEMORY-7 privacy while an undeclared commenter reads only the thread repo's project memory and saves nothing (REQ-watch-008 changed); a recall with a query is ranked by relevance then recency; the Discord and WATCH injects search memory for the message; the tool loop searches memory itself before a reply that says it doesn't know, costing a model call only when facts are found (MEMORY-8, MEMORY-9, #67) |
| 2026-09-29 | ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button: Ask option ids come out unique so Choose buttons open and a pick resumes with the pressed label; a reply after a button ask expired clears it instead of restating a dead Choose button (DISCORD-ASK-1/3/5) |
| 2026-09-29 | scheduler-refuses-a-zero-cron-step-0-a-b-0-n-0-as-a-cadenceerror-and-bounds-cron-ranges-at-the-field-maximum-so: Scheduler refuses a zero cron step (*/0, a-b/0, n/0) as a CadenceError and bounds cron ranges at the field maximum, so /schedule create replies instead of hanging the bridge |
| 2026-09-29 | a-deny-listed-thread-under-an-allowlisted-parent-is-refused-silently-on-every-path-deny-wins-discord-5-req-plugins-005: A deny-listed thread under an allowlisted parent is refused silently on every path: deny wins (DISCORD-5, REQ-plugins-005) |
| 2026-09-29 | discord-post-message-gates-on-the-bridge-s-channel-set-allowlist-file-and-corvidinho-discord-allow-channels-union: Discord-post-message gates on the bridge's channel set (allowlist file and CORVIDINHO_DISCORD_ALLOW_CHANNELS union DISCORD_CHANNEL_IDS), so a channel allowlisted only through DISCORD_CHANNEL_IDS can be posted to; deny lists still win |
| 2026-09-29 | security-gate-tests-fail-when-the-gate-is-removed-safe-2-refuses-every-specs-path-github-deny-users-and-deny-orgs-win: Security gate tests fail when the gate is removed: SAFE-2 refuses every specs/ path, GitHub deny_users and deny_orgs win in WATCH and git-push, a community session is refused a private repo through the real visibility lookup, and the live DISCORD-8 requester check is exercised |
| 2026-09-29 | discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes: Discord-send-file serves a thread allowlisted by its own id like the bridge and re-checks the 8 MB cap on the bytes read (DISCORD-17 review follow-up) |
| 2026-09-29 | discord-a-press-on-an-ask-that-is-no-longer-open-timed-out-and-dropped-when-a-newer-ask-was-picked-or-its-session-ttl: Discord: a press on an ask that is no longer open (timed out and dropped when a newer ask was picked, or its session TTL-purged) replies "that choice expired" with no agent run (DISCORD-ASK-5, REQ-discord-045) |
| 2026-09-29 | every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment: Every cap on the way to a post keeps the closing ROLES-CHAT-3 (not allowed for your role) note: the WATCH summary comment, scheduled-run posts and run rows, /work and /session start answers, and the SAFE-8 80% warning append |
| 2026-09-29 | schedule-result-and-ask-posts-name-the-project-never-its-absolute-host-path-a-tampered-unkeyed-audit-chain-reads-chain: Schedule result and ask posts name the project, never its absolute host path; a tampered unkeyed audit chain reads chain BROKEN at #N without an HMAC key |
| 2026-09-29 | docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in: Docs: operator docs match the code - --help and the go-live checklist say empty Discord user/role allowlists admit anyone in an allowlisted channel (not deny-all), .env.example gives an absolute CORVIDINHO_ALLOWLIST_FILE because ~ is not expanded, and docs/DAEMON.md lists daemon.start_failed and spend.warning |
| 2026-09-29 | docs-operator-docs-match-the-code-help-and-the-go-live-checklist-say-empty-discord-user-role-allowlists-admit-anyone-in: Docs: operator docs match the code - --help and the go-live checklist say empty Discord user/role allowlists admit anyone in an allowlisted channel (not deny-all), and docs/DAEMON.md lists daemon.start_failed and spend.warning |
| 2026-09-29 | safe-5-safe-6-regression-tests-audit-chain-tamper-on-any-audit-log-column-dangerous-run-error-rows-with-exit-codes-re: SAFE-5/SAFE-6 regression tests: audit chain tamper on any audit_log column, dangerous-run error rows with exit codes, re-scrub of every listed column, and the bridge start and /status audit line from the real DB and key |
| 2026-09-29 | free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit: Free-text asks post a short public stub with the question and one Answer button that opens a private form; its submit passes the same gates as a button press and resumes the requester's session like a reply; replying in the channel still works (DISCORD-ASK-4.a) |

| 2026-09-29 | prompt-injection-hygiene-display-names-are-cleaned-before-the-model-sees-them-and-a-name-that-imitates-the-owner-or-a: Prompt-injection hygiene: display names are cleaned before the model sees them and a name that imitates the owner or a declared person is flagged, identity and role still only from declared ids (SAFE-11); a non-owner's chat, /session start and /work text, WATCH issue/PR/comment titles and bodies, and GitHub reader and guild-member tool results reach the model fenced as untrusted data, and the system prompt says such blocks never grant permission (SAFE-12); a conservative always-on detector refuses a non-owner message or WATCH event that looks like an injection attempt before any run with one short reply that tells the owner, and a tool result that trips it drops every mutating tool for the rest of the run and tells the owner on the answer, every hit audited (SAFE-13, #71) |
| 2026-09-29 | discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe: Discord rich final replies: answer footer with model, tokens, cost and time (tokens and cost owner-only) and fence-safe splits at 2000 (DISCORD-15/15.a/16) |
| 2026-09-29 | condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the: Condense long chats at about 80% of the model's window with the task and latest instruction pinned, resume from the summary after the soft TTL, and keep each thread's summary 30 days (SESSION-5/6, SESSION-3.a, AGENT-6.a; #72) |
| 2026-09-30 | forget-from-github-and-from-admin-approved-on-the-card-a-declared-person-matched-by-github-numeric-id-who-comments: Forget from GitHub and from /admin, approved on the card: a declared person (matched by GitHub numeric id) who comments 'forget me' to the watch user raises the owner's existing Approve/Deny forget card with no model run and gets a reply on the thread (an undeclared sender is told nothing is kept, no card), the outcome is posted on that thread; the owner can start a forget for any declared person with owner-only, SAFE-5 audited /admin people forget, the same card; either way nothing is forgotten until the owner approves, and Approve also deletes the person's kept WATCH conversations by the GitHub login and numeric id the ask came from, never the owner who started it (MEMORY-ACL-6.a, #101) |
| 2026-09-30 | community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply: Community members can't start /work: declared community and undeclared users get the quiet ephemeral not-authorized reply and no worktree, branch, work task or run, while the owner and team keep /work (IDENTITY-11.a, #65) |
| 2026-09-30 | on-github-people-match-only-by-their-numeric-user-id-a-renamed-or-re-registered-login-never-counts-as-the-owner-or-a: On GitHub people match only by their numeric user id: a renamed or re-registered login never counts as the owner or a declared person on WATCH (prompt, memory scope, SAFE-13 exemption); [owner] github_id declares the owner's id; /admin people link github stores the looked-up numeric id; doctor warns about logins without an id (IDENTITY-7.a, #36) |
| 2026-09-30 | safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by: SAFE-2.a: the file tools refuse .fledge/ like fledge.toml and specs/, so a run cannot weaken the verify lane it is judged by |
| 2026-09-29 | an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like: An answer typed in the private Answer form is fenced and scanned like a chat reply: a non-owner's submit that looks like an injection starts no run, keeps the ask open, pings only the owner once and appends an injection-suspected audit row; an ordinary non-owner answer reaches the model inside the untrusted-data fence; the owner's answer is unchanged (SAFE-12/13, DISCORD-ASK-4.a) |
| 2026-09-29 | private-notes-profile-reads-and-the-owner-s-view-of-someone-s-memory-are-shown-only-privately-in-a-discord-conversation: Private notes, profile reads and the owner's view of someone's memory are shown only privately: in a Discord conversation the memory plugins hand that text past the model (privateText; the model gets a sent-privately placeholder), task run carries it as privateReplies, and the bridge sends it by DM to whoever asked on chat, button pick and Answer form resumes, /session start and /work, with a short sent-privately note in the channel and never the text; refused in schedules and GitHub threads (MEMORY-7.a, #101) |
| 2026-09-30 | the-bridge-s-update-post-bridge-live-note-on-every-restart-announcements-channel-only-is-a-short-note-in-persona-md-s: The bridge's update post (bridge-live note on every restart, announcements channel only) is a short note in persona.md's voice with the version and a link to that version's GitHub Release notes, never a CHANGELOG bullet dump: deterministic template, no model call, under 400 chars, one message, mass mentions defanged, scrubbed (PERSONA-1.a, #69) |
| 2026-09-30 | verification-can-t-be-skipped-and-the-real-diff-since-the-talk-started-decides-what-changed-agent-14-agent-15-agent-15: Verification can't be skipped and the real diff since the talk started decides what changed (AGENT-14, AGENT-15, AGENT-15.a): task run refuses --no-verify, [corvidinho] verify_before_complete is ignored, filesChanged comes from the real git diff alone (a claimed path git does not show still runs the lane), and a talk worktree whose last run did not end verified verifies from the talk branch's merge-base |
| 2026-09-30 | ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a: Ask questions and choice labels are secret-scrubbed before they are cut or posted (SAFE-6.a) |
| 2026-09-30 | a-non-owner-s-schedule-text-is-scanned-at-schedule-create-and-fenced-at-every-tick-a-non-owner-s-create-whose-name-or: A non-owner's schedule text is scanned at /schedule create and fenced at every tick: a non-owner's create whose name or prompt looks like an injection stores nothing, gets a private refusal, pings only the owner and appends an injection-suspected audit row; each tick re-resolves the creator's role, fences a non-owner's stored name and prompt as untrusted data, and stored text that trips the detector runs nothing, pauses the schedule and tells the owner once; the owner's own schedules are unchanged (SAFE-12/13) |
| 2026-09-30 | scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run: Scheduled runs read and act only on repos the owner allowlists, even public ones (DISCORD-SCHEDULE-3.a): in a schedule run and its delegate/council workers (CORVIDINHO_DISCORD_SESSION_ID schedule_*, SCHEDULE_SESSION_PREFIX / isScheduleRunEnv) the GitHub tools, review readers and docs/milestone readers refuse a repo off the GITHUB-6 allowlist with no visibility lookup (deny still wins, role rules still apply on top); web-fetch refuses GitHub-host URLs that do not name an allowlisted OWNER/REPO at every hop, redirects included; a schedule project that lies in a git checkout nested inside the bridge root needs an allowlisted origin at /schedule create and every tick |
| 2026-09-30 | a-non-owner-s-picked-choose-label-reaches-the-resumed-run-inside-the-untrusted-data-fence-like-their-typed-words-source: A non-owner's picked Choose label reaches the resumed run inside the untrusted-data fence like their typed words (source=ask-pick, the presser's role resolved at press time with their Discord role ids); the owner's pick prompt is byte-identical; a pressed option id that matches none of the ask's options is refused as expired and never reaches the run raw (SAFE-12.a, DISCORD-ASK-3/5/8) |
| 2026-09-30 | req-discord-212-says-where-a-parent-deny-reaches-its-threads-a-deny-listed-thread-is-refused-on-every-path-while-a-deny: REQ-discord-212 says where a parent deny reaches its threads: a deny-listed thread is refused on every path, while a deny on the parent alone refuses a thread allowlisted by its own id only where the bridge knows the parent (MessageCreate, and a message-started thread session's ask buttons, restart rows and discord-send-file); slash, schedule and discord-post-message gate the id they are given; tests pin both cases |
| 2026-09-30 | when-it-repeats-a-failing-call-it-is-steered-to-change-approach-then-asks-a-stuck-github-run-pings-the-owner-on-discord: When it repeats a failing call it is steered to change approach, then asks; a stuck GitHub run pings the owner on Discord (AGENT-16, AGENT-16.a) |
| 2026-09-30 | a-schedule-s-question-can-be-answered-or-cancelled-by-the-owner-or-its-creator-and-its-next-runs-wait-with-one-note: A schedule's question can be answered or cancelled by the owner or its creator, and its next runs wait with one note (AUTONOMY-6.a, REQ-discord-606): Choose / Answer + Cancel controls that never lapse while open, due runs skipped with no catch-up, a channel-less schedule's ask by DM to the owner, the answer to the next run once; schema v15 |
| 2026-09-30 | only-the-owner-sees-spend-amounts-and-cap-settings-on-discord-everyone-else-sees-only-work-is-paused-for-budget-safe-14: Only the owner sees spend amounts and cap settings on Discord; everyone else sees only 'Work is paused for budget.' (SAFE-14.a): spend-cap posts, the /work PR line, the slash owner notice and SPEND_CAP_SUMMARY say only that; the question quote is dropped on every path including the daemon pending-ask pass; the 80% warning never rides a channel post and, with a cap stop's details, goes to the owner by DM (src/discord/spend-dm.ts, retried every scheduler tick); the /status spend line is owner-only |
| 2026-09-30 | one-approve-deny-dm-card-engine-for-everything-that-needs-the-owner-s-ok-exact-action-target-and-amount-one-line-each: One Approve/Deny DM card engine for everything that needs the owner's OK: exact action, target and amount one line each with a diff or text sent first as verbatim quoted-data parts and buttons last, never cut; destructive and money cards also need a one-time code DMed apart and typed into a form, valid once, only for that card and action, for 2 minutes; no answer, a late answer or a gone waiter is a no; the engine's own poll delivers with the scheduler off; the forget card becomes its destructive 'forget' kind; schema v14 approval_requests / approval_codes (SAFE-18/19/20, #96) |
| 2026-09-30 | verified-requires-that-tests-actually-ran-and-none-were-deleted-agent-15-a-passing-verify-lane-counts-only-when-its: 'Verified' requires that tests actually ran and none were deleted (AGENT-15): a passing verify lane counts only when its output has a recognised test summary (bun test, jest, vitest, cargo test, pytest, go test) with at least one executed test and no test active at the baseline was deleted, retitled or turned off (skip, todo, silenced by only), by name across the repo root; non-git projects walk their test files at run start; /work checks the tree against the merge-base before commit and push |
| 2026-09-30 | it-asks-me-on-an-approve-card-before-touching-prod-or-deploys-or-making-a-channel-post-anything-else-it-just-does-and: It asks me on an Approve card before touching prod or deploys or making a channel post; anything else it just does and tells me (AUTONOMY-9/9.a, AUTONOMY-10/10.a channel posts, AUTONOMY-11, #97) |
| 2026-09-30 | i-configure-the-models-openai-compatible-ollama-anthropic-with-no-built-in-default-and-it-says-so-when-none-is-set: I configure the models (OpenAI-compatible, Ollama, Anthropic) with no built-in default, and it says so when none is set (AGENT-13, AGENT-10) |
| 2026-09-30 | shared-db-open-and-safe-5-audit-append-retry-a-busy-sqlite-lock-every-millisecond-so-other-processes-committing-back-to: Shared DB open and SAFE-5 audit append retry a busy SQLite lock every millisecond, so other processes committing back to back cannot pass them over for the whole busy_timeout and lose audit rows |
| 2026-09-30 | shared-db-open-takes-the-write-lock-up-front-so-processes-that-open-a-new-file-or-one-with-a-re-scrub-due-at-once-take: Shared DB open takes the write lock up front, so processes that open a new file or one with a re-scrub due at once take turns instead of failing part way |
| 2026-09-30 | if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11: If a model fails or is retired it falls back to my next configured model and tells me (AGENT-11) |
| 2026-09-30 | owner-chat-session-start-and-work-may-use-the-allowlisted-shell-runners-and-fledge-runs-only-in-that-talk-s-own: Owner chat, /session start and /work may use the allowlisted shell, runners and Fledge runs only in that talk's own worktree; non-owners, WATCH, schedules, workers and the local CLI never get them (SAFE-3.a) |
| 2026-09-30 | a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after: A message sent while a run is going waits for it, and stop or cancel stops the run; waiting messages still run after (AGENT-3.a, AGENT-3.b) |
| 2026-09-30 | a-schedule-the-owner-creates-runs-with-the-owner-s-tools-and-allowlist-never-the-shell-runners-or-fledge-commands-and: A schedule the owner creates runs with the owner's tools and allowlist (never the shell, runners or Fledge commands) and asks on Approve cards where the must-ask list says so, a denied or lapsed card ending the run with a blocking ask; schedules other people create stay read-only (DISCORD-SCHEDULE-1.a) |
| 2026-09-30 | in-a-specsync-repo-it-opens-and-works-a-specsync-change-for-its-edits-and-on-corvidinho-it-approves-and-archives-its: In a SpecSync repo it opens and works a SpecSync change for its edits, and on Corvidinho it approves and archives its own change once verify is green (AGENT-18 SpecSync clause, AGENT-18.a) |
| 2026-09-30 | rolling-24-hour-spend-caps-per-provider-plus-the-total-cap-each-warning-the-owner-at-80-and-stopping-to-ask-at-100-safe: Rolling 24-hour spend caps per provider plus the total cap, each warning the owner at 80% and stopping to ask at 100% (SAFE-14, SAFE-15): CORVIDINHO_PROVIDER_SPEND_CAPS_USD (provider=USD keyed on the configured provider id; a malformed or unknown key stops every call, value never echoed) next to CORVIDINHO_DAILY_SPEND_CAP_USD (the total cap); every provider call is recorded while any cap is set; SpendLedger.window(now, provider?) with a (provider, ts) index; reserve() checks the total and the call's provider cap in one IMMEDIATE transaction and names each tripped scope (total, provider:<id>) in owner-only text; spend_alerts gains a scope column (idempotent ALTER, scrubbed) so each cap warns once per crossing and pings once per episode; a cap stop is never a model failure; doctor and the owner's /status show each cap |
| 2026-09-30 | at-a-spend-cap-the-run-asks-the-owner-on-a-dm-spend-approve-card-with-a-one-time-code-instead-of-refusing-approve-lets: At a spend cap the run asks the owner on a DM spend Approve card with a one-time code instead of refusing; Approve lets only the paused call through at the amount shown and the next call past the cap asks again (SAFE-8, SAFE-8.a, SAFE-15, SAFE-19 money) |
| 2026-09-30 | a-failed-run-tells-the-owner-why-in-one-plain-line-and-everyone-else-that-it-didn-t-work-and-the-owner-has-been-told: A failed run tells the owner why in one plain line, and everyone else that it didn't work and the owner has been told (DISCORD-3.b) |
| 2026-09-30 | a-cli-task-run-in-a-git-repo-works-in-its-own-worktree-by-default-here-runs-it-in-my-checkout-session-worktree-1-a: A CLI task run in a git repo works in its own worktree by default; --here runs it in my checkout (SESSION-WORKTREE-1.a) |
| 2026-09-30 | a-call-whose-price-is-unknown-stops-and-asks-on-the-owner-s-spend-card-showing-the-amount-as-unknown-when-a-cap-covers: A call whose price is unknown stops and asks on the owner's spend card showing the amount as unknown when a cap covers it (recorded unknown, owner lines read $X + unknown, no price override), and every surface asks before spending over a cap: WATCH spend-cap stops reach the owner by DM and a schedule's spend-cap stop can go on through the card (SAFE-16, SAFE-16.a, AUTONOMY-8) |
| 2026-09-30 | a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a: A Stop button on the run's progress message lets me or the person who asked stop it (AGENT-3.a) |
| 2026-10-01 | before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed: Before a PR opens, a second model reviews the diff in bounded rounds, and the PR lists what it raised and what changed (GITHUB-9, GITHUB-9.a) |
| 2026-10-01 | an-idle-timeout-and-a-turn-cap-i-set-stop-stalled-or-endless-runs-and-it-says-so-agent-12: An idle timeout and a turn cap I set stop stalled or endless runs, and it says so (AGENT-12) |
| 2026-10-01 | its-first-20-replies-in-public-threads-each-wait-for-my-ok-on-an-approve-card-even-text-i-dictated-and-replies-to-me: Its first 20 replies in public threads each wait for my OK on an Approve card, even text I dictated and replies to me (AUTONOMY-10, AUTONOMY-10.a) |
| 2026-10-01 | a-team-member-s-failed-session-or-work-reply-and-someone-else-s-failed-schedule-post-is-checked-for-the-reason-s-401: A team member's failed /session or /work reply, and someone else's failed schedule post, is checked for the reason's 401 with the run's own random ids masked, so an id that happens to contain 401 no longer fails the DISCORD-3.b test |
| 2026-10-01 | in-a-non-git-project-my-runs-work-in-the-folder-itself-its-file-tools-leave-the-root-agents-md-and-claude-md-alone: In a non-git project my runs work in the folder itself, its file tools leave the root AGENTS.md and CLAUDE.md alone, schedules keep their own folder, and others only read there (AGENT-1.a, AGENT-1.b, AGENT-1.c) |
| 2026-10-01 | in-a-hi-repo-it-never-changes-the-criteria-itself-any-hi-change-no-approved-capture-made-blocks-done-and-the-pr-agent: In a hi repo it never changes the criteria itself: any hi/ change no approved capture made blocks done and the PR (AGENT-18, hi guard) |
| 2026-09-30 | web-search-through-brave-plugin-7-plugin-9-issue-318-a-dangerous-mintier-1-web-search-command-in-plugins-web-offered: Web search through Brave (PLUGIN-7, PLUGIN-9, issue 318): a dangerous minTier-1 web-search command in plugins/web, offered only when allowlisted and only to the owner and team; Brave results reach the model only inside the untrusted web fence and are SAFE-13 scanned; the key comes from BRAVE_SEARCH_API_KEY only and never appears in any output; requests go through a shared https-only, host-allowlisted, redirect-refusing JSON GET on the pinned-DNS public-address checks; each search reserves about 0.005 USD against the SAFE-8 cap |
| 2026-10-01 | gif-search-through-giphy-plugin-8-plugin-9-issue-318-slice-b-a-dangerous-mintier-1-gif-search-command-in-a-new-plugins: GIF search through GIPHY (PLUGIN-8, PLUGIN-9, issue 318 slice B): a dangerous minTier-1 gif-search command in a new plugins/gif, offered only when allowlisted and only to the owner and team; GIPHY's Tenor-compatible v2 search with contentfilter=medium (G and PG) always sent; titles and GIPHY media links reach the model only inside the untrusted web fence and are SAFE-13 scanned, posted as a link only; the key comes from GIPHY_API_KEY only, sits in the request URL and never appears in any output; each search is recorded at 0 USD against the SAFE-8 cap |
| 2026-10-06 | the-fixed-bridge-live-note-it-posts-after-a-restart-is-system-text-not-an-announcement-so-it-posts-without-waiting-for: The fixed bridge-live note it posts after a restart is system text, not an announcement, so it posts without waiting for the owner's OK (AUTONOMY-10.b, #124) |
| 2026-10-06 | i-or-the-schedule-s-creator-can-stop-a-scheduled-run-in-progress-from-discord-the-same-way-as-a-chat-run-agent-3-c: I or the schedule's creator can stop a scheduled run in progress from Discord, the same way as a chat run (AGENT-3.c) |
| 2026-10-05 | where-a-repo-uses-hi-it-drafts-criteria-and-asks-the-owner-on-a-card-before-capturing-them-agent-18-hi-drafts: Where a repo uses hi it drafts criteria and asks the owner on a card before capturing them (AGENT-18, hi drafts) |
| 2026-10-05 | work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9: /work runs its second-model review rounds before the PR and skips with not-reviewed otherwise (GITHUB-9) |
| 2026-10-06 | work-schedule-and-the-scheduler-can-be-turned-off-in-corvidinho-plugins-and-existing-installs-stay-on-plugin-5-5-a: /work, /schedule and the scheduler can be turned off in [corvidinho.plugins], and existing installs stay on (PLUGIN-5/5.a) |
| 2026-10-07 | admin-3-c-part-1-as-owner-i-can-change-the-deny-lists-and-the-github-repo-allow-lists-with-admin-deny-and-admin-github: ADMIN-3.c part 1: as owner I can change the deny lists and the GitHub repo allow lists with /admin deny and /admin github; every change is audited and github watch re-reads the allowlist every poll |
| 2026-10-07 | every-working-day-the-owner-and-each-teammate-get-a-short-briefing-dm-about-their-own-work-in-their-own-hours-and: Every working day the owner and each teammate get a short briefing DM about their own work, in their own hours and timezone (COS-1, COS-2, COS-2.a; #102) |
| 2026-10-07 | named-personas-are-their-own-files-in-personas-with-name-model-and-skill-tags-the-owner-can-run-a-task-as-one-and-a: Named personas are their own files in personas/ with name, model and skill tags; the owner can run a task as one and a lead's delegate picks one by skill tag; team and community can't pick one (AUTONOMOUS-2.a, AUTONOMOUS-5.a) |
| 2026-10-07 | my-own-memory-forget-and-override-by-id-ask-me-on-a-dm-card-with-approve-and-a-one-time-code-and-an-override-shows-the: My own memory forget and override by id ask me on a DM card with Approve and a one-time code, and an override shows the new text word for word (SAFE-18.a) |
| 2026-10-07 | once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s: Once a session question's buttons expire the session stops waiting and my next message runs normally; a schedule's questions still wait until answered (AUTONOMY-6.b) |
| 2026-10-07 | admin-3-c-part-2-as-owner-i-can-mute-and-unmute-with-admin-mutes-add-remove-mute-and-unmute-are-audited-aliases-of-the: ADMIN-3.c part 2: as owner I can mute and unmute with /admin mutes add\|remove; /mute and /unmute are audited aliases of the same helper |
