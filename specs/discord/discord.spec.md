---
module: discord
version: 85
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
  - tests/identity.people.test.ts
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
  - tests/worktree.test.ts
  - tests/discord.session-worktree.test.ts
  - tests/worktree.project-scope.test.ts
  - src/memory/types.ts
  - src/memory/store.ts
  - src/memory/index.ts
  - src/memory/scope.ts
  - src/memory/profile.ts
  - src/memory/forget.ts
  - src/memory/rank.ts
  - src/discord/approve-card.ts
  - src/discord/forget-card.ts
  - tests/discord.forget-card.test.ts
  - tests/memory.store.test.ts
  - tests/memory.spawn-env.test.ts
  - tests/memory.rank.test.ts
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
  - tests/discord.admin-people.test.ts
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
  - tests/scheduler.never-stuck.test.ts
  - tests/scheduler.ask-outbox.test.ts
  - tests/scheduler.actor-gate.test.ts
  - src/discord/requester-perms.ts
  - src/discord/index.ts
  - plugins/discord/index.ts
  - tests/discord.protocol-version.test.ts
  - tests/discord.presence.test.ts
  - src/discord/ask-ping.ts
  - src/discord/spend-post.ts
  - tests/discord.spend.test.ts
  - tests/discord.status-audit.test.ts
  - tests/discord.ask-ping.test.ts
  - src/discord/thin-ack.ts
  - tests/discord.thin-ack.test.ts
  - src/discord/ask-buttons.ts
  - src/agent/ask-options.ts
  - tests/discord.ask-buttons.test.ts
  - tests/discord.ask-answer-modal.test.ts
  - tests/discord.ask-ephemeral.test.ts
  - src/discord/inflight-replies.ts
  - tests/discord.inflight-replies.test.ts
  - src/discord/allowed-mentions.ts
  - tests/discord.allowed-mentions.test.ts
  - plugins/discord/send-file.ts
  - tests/discord.send-file.test.ts

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
`githubParticipant`, `CONVERSATION_RETENTION_MS` 30 days,
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
person's retained records (Discord ids, a declared person's GitHub logins) in
the approval's transaction and returns their count (`conversations`). `src/discord/bridge.ts` exports
`CONVERSATION_PURGE_INTERVAL_MS` (hourly purge while running).

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

Export `AnnounceStore` / `postAnnouncement` / `formatBridgeLiveAnnouncement` and `enrichPromptWithMemories`, `formatMemoryInjectBlock`, and related
constants/types from `src/discord/memory-inject.ts` (also re-exported via
`src/discord/index.ts`). `/admin`: `handleAdminCommand`, `formatConfigShow`,
`ADMIN_AUDIT_SURFACE` (`command-handlers/admin.ts`); `planAdminListChange`,
`commitAdminListChange`, `resolveAdminAllowlistPath`, `setTomlDiscordList`,
`setJsonDiscordList`, `writeFileAtomic`, `allowlistFileFormat` (the loader's
`isJsonAllowlistPath` rule), `danglingSymlinkError` (`admin-allowlist.ts`);
`parseJsonObject` (`admin-allowlist.ts`, shared with `/admin people`);
`/admin people` (ADMIN-3.a, REQ-discord-036): `formatPeopleList`
(`command-handlers/admin.ts`); `planPeopleChange`, `commitPeopleChange`,
`setTomlPerson`, `setJsonPerson`, `renderPersonTomlLines`, `samePerson`,
`formatPersonLink`, `PeopleAdminPlan` / `PeopleAdminRequest`
(`admin-people.ts`, the only writer of people and roles; `op: "role"` sets
team / community, ADMIN-3.b). Declared people
(IDENTITY-13/14/7, `src/identity/people.ts`): `resolvePerson(dir, { discordId,
githubLogin, githubId })` → `{ personId, displayName?, role?, person }` | null
(the one resolver; stable ids only; `role` is `owner` for the configured
owner, else the declared `team` / `community`), `roleOfPerson` (effective
role: undeclared or no `role` key ⇒ community, IDENTITY-8/12),
`normalizePersonRole`, `PersonRole` / `DeclarableRole`, `PERSON_ROLES`,
`DECLARABLE_ROLES`, `DEFAULT_PERSON_ROLE`, `loadDeclaredPeople({ allowlist, owner })`
(re-reads `allowlist.sourcePath`, never throws), `buildPeopleDirectory`,
`loadPeopleDirectory`, `readPeopleFile`, `parsePeopleToml` /
`parsePeopleJson` / `parsePeopleText`, `normalizePersonLink`,
`normalizeDiscordUserId`, `normalizeGithubId`, `validGithubLogin`,
`cleanPersonLabel`, `PERSON_ID_RE`, `OWNER_PERSON_ID`, `PERSON_KEYS`,
`LINK_FIELD` and the `DeclaredPerson` / `PeopleDirectory` / `ResolvedPerson`
types.
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
`src/agent/ask-options.ts` exports `resolveAskOptions` / `parseChoicesFromQuestion`.
Gateway `reply` accepts optional `components`; `onComponent` handles button
custom ids. Sessions persist their open asks in `discord_sessions.pending_ask`
(schema v8), keyed by askId (SESSION-MULTI-3 / REQ-discord-044): `pendingAsk`
(with `askId` / `expiresAt` / options) is the newest, the one a thin reply
restates and a free-text reply answers (a button `pendingAsk` past its
timeout is cleared with `clearPendingAsk` before any reply but `cancel` is
gated, so a thin reply never restates it — DISCORD-ASK-5), and `openAsks` holds earlier button
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
scanned. A pick's model-written option label is neither. A
thin or blank submit (`isThinAck`, AUTONOMY-5) is not an answer: the ask
stays, nothing runs and the question is restated in an ephemeral
`formatAskReply` with the Answer button; a cancel submit (`isCancelAsk`,
AUTONOMY-6) clears every open ask of the session like a cancel reply, with the
ephemeral `ASK_CANCELLED_ACK` and no run. A submit on a Choose ask gets the
not-for-you reply. A press or submit on a free-text ask past its timeout gets
`ASK_CHOICE_EXPIRED` and leaves the ask pending (a reply still answers it).
Schedule asks keep posting text without a button.

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

Closing role note on the way to a post (REQ-discord-734, ROLES-CHAT-3 /
REQ-agent-333): `ask-ping.ts` exports `POST_SUMMARY_MAX` (1500) and
`clipPostSummary(summary, headLength = 0)`, which caps a run summary at 1500
chars and at what fits after a `headLength`-char post head within
`ASK_REPLY_MAX` (1900) with `clipKeepingRoleNote`. The scheduler's run-row
summary and schedule post, and the `/work` and `/session start` answers, use
it; `appendPostLine` cuts the body for the SAFE-8 warning line the same way
(ending the kept text in `…`). A closing `(not allowed for your role)` note
stays last; a summary without it is cut exactly as before.

Collapsed answers still notify (REQ-discord-215, AUTONOMY-2/4, SAFE-8 with
DISCORD-ASK-6/7): Discord does not notify a mention added by a message edit.
`ask-ping.ts` exports `formatCollapsedPing` (one line: each mentioned user with
`COLLAPSED_PING_QUESTION` "↑ question for you" for the requester a clarify ask
addresses, `COLLAPSED_PING_NEEDS` "↑ needs you" for everyone else — the owner
on stuck, spend cap or the 80% warning; users in `alreadyPinged` left out;
null when nobody is left) and the `CollapsedPing` type. `spend-post.ts`
exports `postCollapsedPing` (sends that line as a fresh post replying to the
collapsed answer, allowed mentions exactly those users; best effort, never
throws, null when nothing went out); `ChannelPost` gains optional
`replyToMessageId`. The chat answer and the answer to a run a button pick
resumed call it after `finalizeContent` succeeds with the answer's
`mentionUserIds` (ask mention plus the 80% warning's owner) and track the ping
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
still allowlisted.

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
human) never ships a PR (REQ-discord-044).

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
it. Community can't start `/work` (IDENTITY-11.a): right after the SAFE-13
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
`thinkExtras` (with `spend: answerSpendFor(result.usage, model)` when
`isOwnerDiscord(owner, actor)`) and the same failed/done outcome as their
fallback status; their fallback replies carry `answerFooter` on the last part.
`DiscordEmbedPayload.description` is optional (omitted on that embed).

Rich replies (REQ-discord-075, DISCORD-16): `src/discord/rich-reply.ts`
exports `DISCORD_MESSAGE_MAX` (2000), `DISCORD_EMBED_DESCRIPTION_MAX` (4096),
`DISCORD_ANSWER_MAX` (6000), `splitDiscordMessage` (fence-safe line split,
role note kept whole in the last part), `readsBetterAsEmbed` /
`planAnswerParts` (scrub first, SAFE-6, then cut to `DISCORD_ANSWER_MAX`
keeping a role note; one plain message within 2000, one
embed for long plain prose with no fence or mention, else split parts with the
footer on the last), `postAnswerParts` (fresh-reply paths: first part replies
with the answer's mentions, later parts reply to nothing and allow only users
first mentioned in them, so a mention past the first part still pings once;
`keepFooter` keeps the footer beside an Answer button, DISCORD-ASK-4.a)
and `answerSpendFor` (tokens and cost from the run's
`usage` and `priceForModel`). `finalizeContent` edits the first part into the
progress message, posts later parts with the optional
`ThinkingOutbound.sendMessage` (no pings; wired to the gateway reply) and
returns `FinalizedAnswer { messageId, messageIds, complete }`; a re-edit edits
only changed parts. `finishSlashWithThinking` takes optional `post` for the
parts after the deferred reply; `finishSlashWithOwnerNotice` appends the
notice without cutting a split answer. The Discord spawn client passes
`bodyMax: DISCORD_ANSWER_MAX` and returns `AgentSpawnResult.usage`; the
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
MessageCreate gate, the ask-button gate and restart recovery: the thread or
its parent is allowlisted and neither is on `deny_channels` (deny wins,
REQ-discord-212).

DISCORD-6 (REQ-discord-010): `rateLimitByLevel` keys on the actor's
`resolvePermissionLevel` on chat and slash unless `RouterDeps.rateLimit.permLevel`
/ `SlashContext.permLevelFor` pins one; `claimRefusalNotice` (with the optional
`RateLimitState.refusalNoticeAt` map) limits public MessageCreate mute/rate
notices to one per user per window; `command-handlers/mute.ts` exports
`MUTE_SELF_OR_OWNER_REFUSED`, the ephemeral refusal for `/mute` of yourself or
the configured owner.

Untrusted text on Discord (SAFE-11/12/13, #71, REQ-discord-071):
`src/discord/injection-guard.ts` exports `fenceSpeakerText(text, role,
source, id?)` / `speakerFenceHeader(role)` / `SpeakerSurface`
(`chat-message`, `session-topic`, `work-task`, `ask-answer`), `inboundInjection(text,
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

## Invariants

Empty channel allowlist fail-start; empty user/role = deny-all when checked;
empty admin lists = nobody ADMIN; missing token clean exit; no ProcessManager;
secrets out of repo; discord-post-message dangerous; thinking status edits one
progress message in-place; slash handlers re-check channel allowlist and
minPermission before acting; rate/mute refuse only the offending user;
outbound post with requesting_user_id verifies requester channel perms, and in a bridge-started run always for the acting Discord user (`CORVIDINHO_ACTING_DISCORD_USER_ID`): a requesting id naming anyone else refuses and a check that cannot run refuses, nothing posted (REQ-discord-012);
every outbound Discord post (gateway reply, message and embed sends/edits,
slash reply/editReply, component reply/update, discord-post-message) parses
no mentions from its content (`parse: []`,
`@everyone` / `@here` defanged); only the replied-to author and the users an
ask names (`mentionUserIds`) may be pinged (REQ-discord-205);
a run summary's closing `(not allowed for your role)` note survives every cap
between the agent and the post: schedule run rows and posts, `/work` and
`/session start` answers (fitted under 1900), and the SAFE-8 warning append
(REQ-discord-734);
`discord-send-file` attaches only in the channel the bridge set for the run
(never a model-chosen one; none ⇒ refused), after the bridge's channel gate
(`isMonitoredConversation` on the bridge's channel set: a thread passes as
itself or through its parent, a deny on the thread or its parent wins) and the acting user's DISCORD-8 check with Attach
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
every MessageCreate is processed only when its own channel (thread parent or the thread itself) is allowlisted and neither the thread nor its parent is on `deny_channels` (deny wins over an allowlisted parent on chat, thread, reply, ask button, slash, schedule, restart recovery and `discord-send-file`) — a reply or forward that references a tracked bot message never continues the session in another channel, and the gateway keeps a reference only for a same-channel reply (never a forward); an ask button press resumes only in an allowlisted channel (or the session's thread under an allowlisted parent) while the session's own channel is still allowlisted, else an ephemeral tip (admin) or zero-width ack with no resume (DISCORD-5 / DISCORD-DENY-1..3 / REQ-discord-212);
every @mention/reply/thread message and every slash command also passes `gateActor` after the channel gate: deny-listed users/roles are refused, and when the user or role allowlist is non-empty only listed users, allowed roles or the owner pass; empty user+role lists keep the channel-only path; refusal is silent on MessageCreate and a zero-width ephemeral ack on slash (ALLOW-3/5 / DISCORD-5 / DISCORD-DENY-1..3 / REQ-discord-201);
an ask button press (open or pick) passes channel → `gateActor` (with the press's role ids) → mute/rate (shared per-user state, presser's resolved level) before it opens choices or resumes; a refusal is ephemeral only — zero-width ack for an actor deny, `MUTED` / `RATE_LIMITED` for mute/rate — with no agent run, nothing sent or edited, and the pending ask kept (DISCORD-6 / DISCORD-DENY-3 / REQ-discord-201 / REQ-discord-010);
after those gates, the requester's press on an ask that is no longer open because it timed out (dropped when a newer ask was cleared, or cleared by a late press) or its session was TTL-purged (at runtime or on load) gets only the ephemeral `ASK_CHOICE_EXPIRED` — no agent run, no session, nothing sent or edited — while another user's press, a re-press after a pick and a press after cancel keep the not-for-you reply; the channel gate judges such a press against the closed ask's session channel and thread as for a live ask, so it holds in the talk's thread under an allowlisted parent (DISCORD-2.a) and stays zero-width elsewhere or once that channel left the allowlist; the store keeps such an ask only as `{ askId, userId, expiresAt, channelId, threadId? }` in memory (no question or option text, newest `CLOSED_ASKS_MAX`) (DISCORD-ASK-5 / DISCORD-ASK-8 / SAFE-6 / REQ-discord-212 / REQ-discord-045);
SessionStore/WorkStore MAY persist via shared store SQLite under ~/.local/share/corvidinho with soft TTL ~45m (SESSION-1..4 / REQ-discord-019);
every Discord agent run (chat, button pick, `/session start`, `/work`) records the human's own words with its session as the run starts (so a run that throws or a bridge that dies mid-run keeps the request) and the posted answer or failure line when it ends (a button ask as its question and choices, a spend-cap stop with no answer turn), and a continued run gets those turns, scrubbed, oldest first, in one labelled block ahead of the new message; when that prompt reaches about 80% of the model's window (`CORVIDINHO_LLM_CONTEXT_TOKENS`, default 8192 tokens, never past 32000 chars) the oldest turns fold into the session's summary (extractive points, no model call) while the opening request, the newest human turn and the new message stay word for word, and the summary is stored with the session so a restart or a smaller window picks up from it (SESSION-5/6 / REQ-discord-472); the block is one `[Corvidinho …]` paragraph, so Planning module selection skips it (REQ-agent-004); live turns persist in `discord_session_turns` across a restart within the soft TTL and their rows go with their session (end or TTL) after its conversation is kept 30 days in `conversation_threads`, from which only its own user's reply to one of its answers or message in its thread starts a new session after the gates (SESSION-3.a / AGENT-6.a); turns never reach another user's session, and never feed SAFE-4 confirm tokens, which stay the current message's only (AGENT-6 / DISCORD-2 / SESSION-3 / SESSION-MULTI-1 / REQ-discord-072);
channel autocomplete (`/admin channels add|remove`, `/announce channel`) lists channels only for ADMIN (the owner, not muted, not deny-listed) invoking from an allowlisted channel, re-checked on every request; anyone else, anywhere else, or a gateway with no gate wired gets an empty choice list, so no channel name, id or allowlist entry leaks (DISCORD-DENY-3 / ADMIN-4 / REQ-discord-431);
`/admin` users add | channels add|remove | config show is owner-only with a dispatcher ADMIN floor plus a handler re-check, writes only `[discord].users` / `[discord].channels` of the allowlist file the bridge loaded (atomic temp+rename, other lines kept), updates the live allowlist in place without restart, never writes env values, refuses deny-listed ids, env-only removals and removing the last live channel (a channel also on `deny_channels` does not count as live), warns when the first user narrows STANDARD→BLOCKED, and appends SAFE-5 audit rows (fail closed) (ADMIN-1..4 / REQ-discord-043);
`/schedule` list|create|pause|resume|delete with ADMIN mutations, 5m min cadence, schedules in shared SQLite, cooperative ~60s ticker that must not starve HEAR/WATCH ingress (DISCORD-SCHEDULE-1..5 / REQ-discord-020); `/schedule delete` (the schedule and its run history) appends SAFE-5 audit rows (`started` before the delete, then `ok`/`error`; `denied` for a non-ADMIN caller) and fails closed like `/admin` when the trail is unavailable or not wired (SAFE-5 / REQ-discord-020);
memories in shared SQLite schema v3 scoped by `owner_user_id` — the acting Discord user id for anyone undeclared, `person:<id>` for a declared person's one profile (MEMORY-5), `project:<key>` for a repo's own memory (MEMORY-6) (src/memory/scope.ts); ADMIN-only forget/override incl. self-forget; empty admin deny-all; no `/memory` slash (MEMORY-1..4 / MEMORY-ACL-1..5 / REQ-discord-021); a person's memory is read only by them and the owner and private notes are never injected or recalled unless asked for by name (MEMORY-7 / REQ-plugins-101); anyone's forget request (`forget_requests`, schema v12, ids and times only) reaches the owner as a DM Approve/Deny card (`src/discord/approve-card.ts`, reusable; `src/discord/forget-card.ts`) on every scheduler tick (`onTick`) and after each chat message, and only the owner's press on a pending, unexpired card forgets — SAFE-5 `started` first (fail closed), then one transaction deletes every memory row of that person and their session turns (and their kept conversations, REQ-discord-472) — telling both; Deny, no answer or a late press is a no (MEMORY-ACL-6 / REQ-discord-101); a recall with a query is a ranked search (relevance, then recency; `src/memory/rank.ts`) and the chat / button-pick inject searches memory for the message (the owner's and team's `/work` project block for the description), relevant rows first then the newest (MEMORY-9 / REQ-discord-067); Discord agent spawn always overwrites `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty when no actor) and `CORVIDINHO_ACTING_IS_ADMIN` so no run inherits an actor from the bridge env, and always clears the GitHub commenter keys (`CORVIDINHO_ACTING_GITHUB_*`, MEMORY-8);
a message reply or button-pick run keeps one `discord_inflight_replies` row (ids incl. a thread's allowlisted parent channel + start time, no text) from before its progress embed is sent until it finishes, cleared on every exit path (including the moment the progress message is collapsed into the answer or Choose stub, DISCORD-ASK-6/7); the next bridge start edits each leftover row's own progress embed to the red failed status `interrupted: Corvidinho restarted before this reply finished — please send it again`, or replies to the recorded request message in the same channel when there is no embed id or the edit fails, then deletes the row — only while the row's channel or parent is still allowlisted (DISCORD-5), sequential, best effort, never throws out of startup, nothing posted when no rows (DISCORD-3 / AGENT-3 / REQ-discord-311);
`/schedule` list|create|pause|resume|delete with ADMIN mutations, 5m min cadence (a zero cron step — `*/0`, `a-b/0`, `n/0` in any field — is a `CadenceError` refused before any field is expanded, and a range is expanded only up to its field's maximum, so no cadence can hang `/schedule create`, the store's next-run computation or the bridge), schedules in shared SQLite, cooperative ~60s ticker that must not starve HEAR/WATCH ingress (DISCORD-SCHEDULE-1..5 / REQ-discord-020); `/schedule delete` (the schedule and its run history) appends SAFE-5 audit rows (`started` before the delete, then `ok`/`error`; `denied` for a non-ADMIN caller) and fails closed like `/admin` when the trail is unavailable or not wired (SAFE-5 / REQ-discord-020);
memories in shared SQLite schema v3 scoped by Discord owner_user_id; ADMIN-only forget/override incl. self-forget; empty admin deny-all; no `/memory` slash (MEMORY-1..4 / MEMORY-ACL-1..5 / REQ-discord-021); Discord agent spawn always overwrites `CORVIDINHO_ACTING_DISCORD_USER_ID` (empty when no actor) and `CORVIDINHO_ACTING_IS_ADMIN` so no run inherits an actor from the bridge env;
a message reply or button-pick run keeps one `discord_inflight_replies` row (ids incl. a thread's allowlisted parent channel + start time, no text) from before its progress embed is sent until it finishes, cleared on every exit path (including the moment the progress message is collapsed into the answer or Choose stub, DISCORD-ASK-6/7); the next bridge start edits each leftover row's own progress embed to the red failed status `interrupted: Corvidinho restarted before this reply finished — please send it again`, or replies to the recorded request message in the same channel when there is no embed id or the edit fails, then deletes the row — only while the row's channel or parent is still allowlisted and neither is deny-listed (DISCORD-5), sequential, best effort, never throws out of startup, nothing posted when no rows (DISCORD-3 / AGENT-3 / REQ-discord-311);
per-talk/project git worktrees (or scoped dirs) under `.corvid-worktrees`/`WORKTREE_BASE_DIR` with schema v4 session columns; end/TTL parks worktree; project never silent mid-talk switch; schedule ticks use project scope (SESSION-WORKTREE-1..5 / REQ-discord-022); package 0.0.5.
`/work` opens a draft PR only from a verified git worktree with changes, only when `git-commit` (dirty tree), `git-push` and `github-pr-create` are all allowlisted for non-interactive use, and only through those typed plugins; otherwise its reply says plainly why no PR (AUTONOMOUS-3 / GITHUB-2/5/6 / AGENT-4 / REQ-discord-088).
Schedule ticks are safe with a bridge and `corvidinho daemon` on one data dir: each tick `refresh()`es the schedules table, `claimRun()` compare-and-sets a due run so it fires once, and store updates write only their own columns so a finishing run never undoes a pause/resume made elsewhere; each run outcome is recorded once (`onRunFinished`, `drain`, `abandonInFlight` for shutdown) and an abandoned run's spawned agent is killed with its whole process tree through `AgentRunChatOpts.signal` (the spawn client runs each agent in its own process group, AGENT-3) (CLI-8 / AUTONOMOUS-4 / REQ-discord-108). A run never stays "running" forever (REQ-discord-346): `finish()` counts a run recorded only after `markRunFinished` (one IMMEDIATE transaction) succeeds, retrying a throwing write once and otherwise logging `[scheduler] run failed: could not record run …` and counting it failed; the bridge's `stop()` abandons in-flight runs like the daemon (`interrupted: bridge shutdown`); both stops wait ≤3 s (`settleAbandoned`, `ABANDONED_SETTLE_MS`) for aborted runs to park their worktree; each claimed run records its runner (`schedule_runs.runner` = `<pid>:<proc start>`, schema v10), and the bridge and daemon start with `recoverAbandoned()`, which fails runs whose runner is gone (`interrupted: process restarted`, `RUN_INTERRUPTED_BY_RESTART`) and parks leftover `talk-schedule_<schedule>_<run>` worktrees of runs this data dir recorded as no longer running, deleting a branch only when it has no commits of its own; a live runner's run and worktree are left alone, and a schedule-run worktree whose run this data dir does not know (another data dir's, e.g. `bun test` run inside it) is never touched.

Needs-human outbox for schedule runs (REQ-discord-347, AUTONOMY-2 / AUTONOMOUS-7): `markRunFinished` also stores the run's ask on its row (`schedule_runs.ask_reason`, `ask_question` scrubbed and capped at `ASK_QUESTION_MAX`, `ask_posted_at`; schema v11, `SCHEMA_VERSION` 11, partial index `idx_schedule_runs_pending_ask`; `ask_question` is in `SCRUB_TARGETS`), and `ScheduleRun` gains optional `ask` / `askPostedAt`. `ScheduleStore.pendingAsks()` returns, per schedule, the newest finished run's ask when no ticker took it (`PendingScheduleAsk`; an older one is moot once a later run finished, a deleted schedule's runs are gone); `claimRunAsk(runId)` takes an ask with a compare-and-set on `ask_posted_at IS NULL` that also re-checks the run is still its schedule's newest finished run (so an ask made moot while a pass is posting is skipped) and `releaseRunAsk(runId)` hands it back. A `SchedulerService` with an outbound (the bridge) takes its own run's ask before posting it (not retried when that post fails, as before, except the auto-pause ask of REQ-discord-353), and each `tick()` starts one fire-and-forget delivery pass (`settleAskDelivery(timeoutMs?)` awaits it; after `stop()` a pass takes no further ask, and the bridge's stop waits ≤3 s, `ABANDONED_SETTLE_MS`, for a post in flight before closing the gateway) that posts pending asks — a run `corvidinho daemon` claimed — for schedules whose creator and channel pass the live DISCORD-SCHEDULE-3 gate (`gateTick`; a refused one stays pending) through the same ask post (`formatAskReply` with the schedule prefix; owner for stuck / spend-cap, creator for clarify; `askPingKey` and `claimCapPing` dedupe; pending 80% warning), handing the ask back when the post resolves `false` or throws (`[scheduler] ask failed: …`). The daemon (no outbound) never takes or posts an ask and keeps its `run.needs_human` log line.
Nightly backup on the scheduler tick (OPS-1/2, REQ-discord-680): `SchedulerServiceOpts.backup` (a `BackupTicker`, `src/store/backup.ts`, REQ-cli-680) is called with the tick's clock after the due runs are claimed and never throws. The bridge builds it over its shared DB with `consoleBackupLog` (`[backup] <event> {json}`, scrubbed) and a `notify` that posts the pending owner notice (`formatBackupNotice`, fixed text, no path or error) to the `/announce` channel through the gateway reply, prefixed `<@owner>` with `mentionUserIds` [owner] (REQ-discord-205), and resolves false when no channel is set, no gateway reply exists or the post fails, so the notice is handed back and retried each tick (`…owner_not_told` logged once) and nothing is posted elsewhere; notices a daemon recorded are delivered the same way, once per failure streak. The bridge's `stop()` stops the backup ticker (no further notice is taken) and waits ≤3 s (`ABANDONED_SETTLE_MS`, `settle(timeoutMs)`) for a notice post in flight before closing the gateway; one still in flight then is handed back, so the next start posts it instead of it being lost. `SchedulerServiceOpts.backup` needs only `tick`. `StartBridgeOptions.schedulerNow` is the scheduler / backup clock test seam.
Schedules never stop or fail to start silently (REQ-discord-353, AUTONOMY-2): a run whose project cannot be resolved or whose worktree cannot be created (also when that step throws) is still recorded failed with the full error (`project resolve failed: …` / `worktree failed: …`), and `failBeforeRun` also records a `stuck` ask whose question is fixed, path-free text (`PROJECT_RESOLVE_FAILED_QUESTION` / `WORKTREE_FAILED_QUESTION`, exported from `src/scheduler/service.ts`; REQ-discord-418). `ScheduleStore.markRunFinished` takes an optional `autoPause: { at, ask }` and, when the run failed and the SQL `consecutive_failures` reaches `at` in the same transaction, stores that ask instead of the run's own; `finish()` passes `{ at: FAILURE_AUTO_PAUSE, ask: autoPauseAsk(runAsk) }` (`autoPauseAsk(last?)`: `Paused after 5 failed runs in a row. Fix the cause, then resume it with /schedule resume.` plus `Last failure: <question>`) and returns the run's effective ask (the pause ask when `maybeAutoPause` paused), which `onRunFinished.askReason` reports. The bridge posts it through `postOwnRunAsk` (the REQ-discord-347 in-process gate, take and `postRunAsk`; the pausing run's ask replaces its `❌` post and, when the run had no ask of its own, carries only its `failed (exit N)` line as context; a run that throws posts its pause ask at once with no context; `handBack` releases a pause ask whose post did not go out, since a paused schedule has no next run) and a daemon run's through the next delivery pass; a DISCORD-SCHEDULE-3 refusal records no ask of its own, and the pause ask of refused runs waits for the gate. No schema change.
Every schedule post — the `✅` / `❌` result line and each ask post (in-process or from the delivery pass, including these stuck asks) — starts with `scheduleTitle` (`Schedule **<name>** (<id>) on <project>`), where the project is `projectLabel(schedule.project)` (`src/discord/list-scope.ts`: the last segment of an absolute path, a relative name as given), never an absolute host path, since the whole channel reads it (REQ-discord-353, REQ-discord-418, SAFE-6). The run row keeps the full error and the model's prompt keeps the stored project.
Schedule ticks are safe with a bridge and `corvidinho daemon` on one data dir: each tick `refresh()`es the schedules table, `claimRun()` compare-and-sets a due run so it fires once, and store updates write only their own columns so a finishing run never undoes a pause/resume made elsewhere; each run outcome is recorded once (`onRunFinished`, `drain`, `abandonInFlight` for shutdown) and an abandoned run's spawned agent is killed with its whole process tree through `AgentRunChatOpts.signal` (the spawn client runs each agent in its own process group, AGENT-3) (CLI-8 / AUTONOMOUS-4 / REQ-discord-108). A run never stays "running" forever (REQ-discord-346): `finish()` counts a run recorded only after `markRunFinished` (one IMMEDIATE transaction) succeeds, retrying a throwing write once and otherwise logging `[scheduler] run failed: could not record run …` and counting it failed; the bridge's `stop()` abandons in-flight runs like the daemon (`interrupted: bridge shutdown`); both stops wait ≤3 s (`settleAbandoned`, `ABANDONED_SETTLE_MS`) for aborted runs to park their worktree; each claimed run records its runner (`schedule_runs.runner` = `<pid>:<proc start>`, schema v10, `SCHEMA_VERSION` 10), and the bridge and daemon start with `recoverAbandoned()`, which fails runs whose runner is gone (`interrupted: process restarted`, `RUN_INTERRUPTED_BY_RESTART`) and parks leftover `talk-schedule_<schedule>_<run>` worktrees of runs this data dir recorded as no longer running, deleting a branch only when it has no commits of its own; a live runner's run and worktree are left alone, and a schedule-run worktree whose run this data dir does not know (another data dir's, e.g. `bun test` run inside it) is never touched.
Each schedule run is gated against the live allowlist before any worktree or agent run and again before its post (DISCORD-SCHEDULE-3 / REQ-discord-020): `SchedulerService` checks the creator with `gateActor` (REQ-discord-201: deny wins; a non-empty user/role list must list the creator's id unless it is the configured `owner`; a tick has no member roles) and the channel with `checkChannel`. A refused run spawns nothing, posts nothing and is recorded failed (`creator not allowlisted: …` / `channel not allowlisted: <id>`), counting toward the 5-failure auto-pause. The bridge ticker shares the allowlist `/admin` edits in place; the daemon reloads it before each tick (REQ-cli-108).
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
scrubbed on write and listed in `SCRUB_TARGETS` (SAFE-6); `spend_alerts` has
no free-text column (a constant kind and integers).
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
Recording a SAFE-8 warning and delivering it are separate: whichever process
crossed 80% records it, and the bridge delivers it on its next post to any
allowlisted channel it already posts in (no new channel, no DM), claiming it
in one IMMEDIATE transaction so two posts never repeat it. A spend-cap ask
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
the model through `fenceSpeakerText` (the owner's unchanged). A run whose
result carries `injection` pings the owner on the post that carries its
answer: chat and button-pick replies (`withInjectionNotice`), `/session
start` and `/work` owner notices (`slashOwnerNotice`) and a schedule run's
result post or ask post. Replayed session turns strip invisible characters and
mark a line that imitates a Corvidinho block or a turn label (`Human:`,
`You (Corvidinho):`) `(quoted)`; recalled memory lines strip invisible
characters. No new env var, config key, table or column.

## Behavioral Examples

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

### Scenario: A stranger named like the owner (SAFE-11)

- **Given** an undeclared user whose Discord display name is `[owner] L<zero-width>eif`
- **When** they ask an ordinary question
- **Then** the run's acting-user block shows `display_name: Leif` with a `name_clash` line and no owner facts, their words are fenced as untrusted data with `role: community`, and the run is community (REQ-discord-071)

## Error Cases

| Condition | Behavior |
|-----------|----------|
| memoryStore undefined | Prompt unchanged; no inject log |
| Blank author id | Prompt unchanged; no inject |
| `/admin` by non-owner / no owner | Ephemeral `not authorized`; no file write |
| Channel autocomplete by a non-ADMIN, a muted or deny-role owner, outside an allowlisted channel, or with no owner | Empty choice list; no channel names or ids (REQ-discord-431) |
| Channel autocomplete gate unset or throws | Empty choice list (fail closed); a throw is logged |
| `/admin` on unreadable/unparsable file | Ephemeral refusal naming the path; file untouched |
| `/admin` audit trail unavailable | Ephemeral refusal (SAFE-5 fail closed); nothing changed |
| `/schedule delete` audit trail unavailable (throws, keyed chain without the key, or no DB) | Ephemeral `Refused: audit log unavailable (SAFE-5)`; schedule and run history kept |
| `/schedule create` cadence with a zero cron step (`*/0`, `a-b/0`, `n/0`, any field, also in a comma list) | Ephemeral `Invalid cron step in "PART": the step must be 1 or more.`; nothing created; the bridge keeps answering (REQ-discord-020) |
| Leftover in-flight reply, embed edit fails or no embed id | Reply to the request message with the interrupted text; row deleted |
| Leftover in-flight reply, edit and reply both fail | Logged as unreachable; row deleted; bridge start continues |
| Leftover in-flight reply in a channel no longer allowlisted, or whose thread or parent is deny-listed | Nothing edited or posted; logged as skipped; row deleted |
| Message, ask button press or slash command in a thread on `deny_channels` under an allowlisted parent (or in a thread under a deny-listed parent) | MessageCreate: silent refuse; interaction: ephemeral zero-width ack (allowlist tip for an admin); no session, run or post (REQ-discord-212) |
| In-flight row write fails (DB busy) | Warning logged; the reply itself still runs |
| Collapsed-answer ping post fails or throws | Nothing retried; the collapsed answer stays and the turn (or slash run) finishes normally; claims already taken are kept |
| `discord-post-message` in a bridge-started run: `--requesting-user-id` names another user, or the acting user's requester check cannot run (Guild Members login refused / timeout / throw) | Refused, exit 3, nothing posted; the check failure is one scrubbed line naming Server Members Intent, no token value (REQ-discord-012) |
| `discord-send-file`: `--channel` given, no conversation channel or acting user, channel not allowlisted (neither the thread nor its parent listed, or a deny on the thread or its parent), SAFE-2 / secret path (by name, link target, or a file or folder swapped for a link after the checks), path outside the project, type not allowed or bytes not matching, over 8 MB (at the size check or in the bytes read; at most 8 MB + 1 byte is read), requester cannot view / send / attach or the check cannot run, empty or secret-touching `--git-diff` | Refused, nothing uploaded (REQ-discord-476) |
| `discord-send-file`: Discord answers 413 / code 40005 (the server's limit is lower) | Refused with the server-limit reason, not retried (REQ-discord-476) |
| A retained-conversation read or write fails (DB busy) | Warning logged (`[discord] conversation … failed`); the run goes on without the summary write or the resume (REQ-discord-472) |
| A reply to an expired session's answer by another user, or a plain message in the thread from someone whose conversation is not there | No resume: routed as before (no mention ⇒ ignored; a mention starts their own session with nothing replayed) (REQ-discord-472) |
| `CORVIDINHO_LLM_CONTEXT_TOKENS` unset, not a positive integer, or below 1024 | 8192 (unset / invalid) or 1024 (too small) (REQ-discord-472) |
| Gateway login rejected (401 `TokenInvalid` / 403) or unreachable | Half-started client stopped; `startBridge` returns `{ ok: false, exitCode: 1 }` with `discord login failed (<status>): check DISCORD_TOKEN (<line>)`; no crash dump, no token value |
| Non-owner chat message, `/session start` topic or `/work` description trips the SAFE-13 detector | No run, no session / worktree / work task; one short public refusal; the owner pinged (chat: in the reply; slash: a fresh channel post); `injection-suspected` audit row (REQ-discord-071) |
| SAFE-13 refusal with no owner configured | The refusal still goes out and says no owner is configured; `INJECTION_NO_OWNER_WARNING` logged (REQ-discord-071) |
| SAFE-13 audit trail unavailable (no DB, keyed chain without the key) | Refusal still sent; one `[discord] SAFE-13 audit row failed` warning (REQ-discord-071) |

## Dependencies

- MEMORY store (`src/memory`) / REQ-discord-021
- Agent spawn client (`agent-client.ts`)

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
| 2026-09-30 | community-members-can-t-start-work-declared-community-and-undeclared-users-get-the-quiet-ephemeral-not-authorized-reply: Community members can't start /work: declared community and undeclared users get the quiet ephemeral not-authorized reply and no worktree, branch, work task or run, while the owner and team keep /work (IDENTITY-11.a, #65) |
| 2026-09-30 | safe-2-a-the-file-tools-refuse-fledge-like-fledge-toml-and-specs-so-a-run-cannot-weaken-the-verify-lane-it-is-judged-by: SAFE-2.a: the file tools refuse .fledge/ like fledge.toml and specs/, so a run cannot weaken the verify lane it is judged by |
| 2026-09-29 | an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like: An answer typed in the private Answer form is fenced and scanned like a chat reply: a non-owner's submit that looks like an injection starts no run, keeps the ask open, pings only the owner once and appends an injection-suspected audit row; an ordinary non-owner answer reaches the model inside the untrusted-data fence; the owner's answer is unchanged (SAFE-12/13, DISCORD-ASK-4.a) |
