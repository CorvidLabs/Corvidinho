---
module: discord
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
---

# Delta: discord (the private Answer form's text is fenced and scanned like a chat reply, SAFE-12/13)

## Modified

### REQUIREMENT REQ-discord-548

When a clarify or stuck ask's choices cannot be listed (the free-text ask of REQ-discord-044 / REQ-discord-045), its public post SHALL stay the short stub that quotes the question and SHALL carry exactly one **Answer** button; the requester's press SHALL open a private form (a Discord modal, interaction response type 9) with one paragraph text input, and the form's submit (interaction type 5, MODAL_SUBMIT) SHALL pass the same gates as a button press and resume the requester's session exactly as a reply that answers the ask would (DISCORD-ASK-4.a, with DISCORD-ASK-2/3/5/7/8). Replying in the channel SHALL still answer it.

- The post is `formatAskReply` (question quoted, requester or owner mention as before) with the hint `ASK_ANSWER_HINT` ("Press **Answer** to answer privately, or reply to this message.") in place of `ASK_REPLY_HINT`, and `buildAnswerStubComponents(askId)`: one Primary button labelled `Answer` on the ask's `open` custom_id. It applies to the chat answer, the follow-up ask of a resumed pick or form submit, the `/work` and `/session start` answer, and a thin-reply restatement while the ask has not timed out (after that the restatement has no button and the reply hint, as before). The post keeps its footer-only embed (it is still the turn's answer, DISCORD-3.a) and its message id is stored as the ask's `stubMessageId`. A SAFE-8 spend-cap stop gets no button and is never pending; a Choose ask (listable options) keeps its Choose stub; a lone option is dropped (free text). Schedule asks keep posting text without a button.
- The requester's press on the Answer button (an `open` press on a pending ask without options) SHALL answer with the modal `buildAnswerModal`: `custom_id` `cvask:answer:<askId>`, title `Answer privately`, one Label component (type 18) `Your answer` whose description is the SAFE-6 scrubbed, defanged, one-line start of the question (≤100 chars), around one required paragraph text input (type 4, style 2, `custom_id` `answer`, `min_length` 1, `max_length` `ASK_ANSWER_MAX` = min(`ASK_QUESTION_MAX`, 4000)). The press posts nothing and runs nothing; the ask stays pending. Without a modal-capable interaction the press keeps today's ephemeral "reply in the channel instead".
- The live gateway SHALL route a MODAL_SUBMIT to the component handler with the form's text input values by input custom_id (`modalValues`); its replies parse no mentions and an ephemeral reply is flag 64. Only the form's `answer` custom_id with typed text is taken; a press id with typed text or the form id without it is ignored.
- The submit SHALL pass, in order, the channel gate (REQ-discord-212), the actor gate with deny lists and a non-empty user/role allowlist (REQ-discord-201), mute/rate (REQ-discord-010), the not-yours / already-answered check and the expiry check, exactly as a press; every refusal is ephemeral only (zero-width ack, the admin allowlist tip, `MUTED` / `RATE_LIMITED`, "This choice isn't for you (or it was already answered)", `ASK_CHOICE_EXPIRED`), with no agent run, nothing posted or edited and the ask left pending (DISCORD-DENY). A submit on a Choose ask gets the not-for-you reply.
- A submit whose scrubbed text is thin or an explicit cancel SHALL be handled as the same text in a reply is (AUTONOMY-5/6): a thin or blank answer (`isThinAck`: `ok`, `sure`, emoji-only, whitespace and similar) SHALL NOT clear the ask or run the agent — the question is restated once, privately (an ephemeral `formatAskReply` with `ASK_ANSWER_HINT` and the Answer button); an explicit cancel (`isCancelAsk`: `cancel`, `never mind`, `forget it`, `stop asking`, `nm`) SHALL clear every open ask of the session, as a cancel reply does (SESSION-MULTI-3), with the ephemeral `ASK_CANCELLED_ACK` and no run. Neither posts or edits anything in the channel.
- An accepted submit SHALL be SAFE-6 scrubbed, control characters dropped, trimmed and cut at `ASK_ANSWER_MAX` (`normalizeAskAnswer`); the ask SHALL be cleared first (a reply or second submit cannot resume twice); the submit gets the ephemeral `ASK_ANSWER_ACK`, deleted when the resumed run ends (DISCORD-ASK-8); the session SHALL resume (`resume: true`) with its thread replayed and the prompt `[Prior clarifying question you asked (the human is answering it now):\n<question>]\n\nHuman answer:\n<answer>` — the block a reply that answers the ask gets, `<answer>` being the answer as the same words in a reply reach the model: inside the `fenceSpeakerText` untrusted-data fence (header naming the role, `source=ask-answer`) for a team or community requester, unchanged for the owner (SAFE-12, REQ-discord-071) — with `humanText`, the memory query and the recorded human turn the scrubbed answer (not the fence), the presser's identity, memory and acting role as on a button pick, and the stub as the progress surface (content and button cleared) edited into the answer (DISCORD-ASK-7). The typed text SHALL NOT be posted.
- Before the ask is cleared, a team or community requester's scrubbed answer (not thin, not a cancel) SHALL be scanned by `inboundInjection` exactly as the same words in a chat reply in that session are, and a hit SHALL be refused as that reply is (SAFE-13, REQ-discord-071; `refuseInjectedAnswer`): no agent run, the ask left pending and the session live, nothing added to the thread; the submit gets an ephemeral refusal (`injectionRefusalHead` plus "I've flagged it to the owner", never the text; without an owner or a post function the `formatInjectionRefusal` line, ephemeral); the owner gets one fresh post in the session's channel (thread first), replying to the ask's stub, that pings only them (allowed mentions the owner only) and says an answer typed in the private Answer form looked like a prompt-injection attempt and why; that post is tracked on the session as a chat refusal is; and one `injection-suspected` / `denied` SAFE-5 row is appended (actor the requester, surface `discord:<session>`, digest of `ask-answer` and the reason ids). The owner's own answer is neither scanned nor fenced. The presser's acting role (`resolveDiscordActingRole`, as on a button pick) SHALL be resolved before this check.
- A button pick's answer is the label of an option the model wrote (or the bot's own option id from the pressed button), not text the presser typed: it SHALL reach the run as before, neither fenced nor scanned.
- A press or submit on a free-text ask past its ~30-minute timeout SHALL get `ASK_CHOICE_EXPIRED` and run nothing, and the ask SHALL stay pending so a reply still answers it with the prior-question block (unlike a Choose ask, which a late press clears, REQ-discord-045). A reply that answered the ask leaves the Answer button answering "already answered".
- No new env var, config key, slash command, table, column or schema version.

Acceptance Criteria
- A chat clarify ask without listable options: the collapsed stub quotes the question, carries `ASK_ANSWER_HINT` (not `ASK_REPLY_HINT`), exactly one Answer button (`open` custom_id) and a footer embed; the pending ask is free text with the stub as `stubMessageId`. A spend-cap stop has no button and no pending ask.
- The requester's Answer press calls `showModal` with `buildAnswerModal` (title ≤45, one type 18 label ≤45 with the question as description, one required type 4 paragraph input, `max_length` `ASK_ANSWER_MAX` ≤ 4000); nothing is posted, no run, the ask stays. Another user's press gets the not-for-you reply and no form.
- The requester's submit resumes the same session with the reply's prior-question block and the trimmed answer (a community requester's inside the untrusted-data fence, `source=ask-answer`); ephemeral `ASK_ANSWER_ACK` then deleted; the stub is thin-updated and edited into the answer; the typed text is never posted; the ask is cleared and a second submit is "already answered". A secret in the text never reaches the run or the thread.
- Another user's, a muted, a deny-listed (user or role), an off-channel, a rate-limited and a late submit (and the same presses) are refused ephemerally with no run and the ask kept; after the late one a thin reply restates without a button and a reply still answers it.
- A reply to the stub answers the ask as before; a later Answer press or submit is "already answered". A thin reply restates with the live Answer button.
- A thin or blank submit (`ok`, whitespace, `👍`, `sure!`) gets only the private restatement with the Answer button: no run, nothing posted, ask kept, nothing added to the thread; a real submit afterwards resumes. A `never mind` / `cancel` submit gets only the ephemeral `ASK_CANCELLED_ACK`, clears the free-text ask and an earlier open Choose ask of the session, runs nothing, and a later Answer press is "already answered".
- `/work` without listable options answers with the Answer button and hint and records `stubMessageId`; its submit resumes that session in the answer message. A follow-up free-text ask from a resumed run gets its own Answer button in the same stub.
- The live gateway routes a MODAL_SUBMIT with its text to the component handler; `adaptModalSubmit` maps text inputs by id, replies ephemerally with no parsed mentions.
- Through `startBridge` with a memory DB: a community user's and a declared team member's submit that tells the bot to ignore its rules starts no run, gets one ephemeral refusal that never quotes it, leaves the ask pending and the session live (the refusal post continues it), adds nothing to the thread, posts once in the session's channel replying to the stub with allowed mentions only the owner, and appends one `injection-suspected` / `denied` row with the user as actor and surface `discord:<session>`; an ordinary community answer runs inside the fence with `humanText` and the thread turn the plain answer and no audit row; the owner's answer, injection-like words included, runs unfenced with no refusal and no row (`tests/safe.injection.test.ts`).
- These tests fail on the base sources.

### REQUIREMENT REQ-discord-071

Untrusted text on Discord (SAFE-11 / SAFE-12 / SAFE-13, #71). The IDENTITY-4
acting-user block SHALL show the acting user's Discord display name or
username only after `cleanDisplayName` (`cleanedDiscordName`; the declared
person's display and the owner map display are the owner's own and shown as
configured), and SHALL add one `name_clash` line when that shown Discord name
reads like the owner's display or another declared person's display or
nickname (`displayNameClash`, `namesLookAlike`); who the user is and their
role come only from the Discord user id (IDENTITY-7 / IDENTITY-12). Chat
messages, `/session start`, `/work` and an answer typed in an ask's private
Answer form (REQ-discord-548) SHALL resolve the speaker's role
(`resolveDiscordActingRole`) before the run. For team and community speakers
(never the owner) `inboundInjection` SHALL scan the speaker's own words; a hit
SHALL start no run: on chat one public reply to the message
(`formatInjectionRefusal`: what it won't do and why in plain words, never the
text, pinging the owner with allowed mentions limited to the owner; without an
owner it says nobody could be told and logs `INJECTION_NO_OWNER_WARNING`), a
session the message started is ended and the turn is not recorded; on slash
(`refuseInjectedSlash`) the interaction gets the public refusal and the owner a
fresh channel post that pings only them, and no session, worktree or work task
is created; on the Answer form (`refuseInjectedAnswer`) as the same words in a
chat reply in that session: the ask stays pending and the session live, the
submit gets an ephemeral refusal (never the text) and the owner one fresh post
in the session's channel, replying to the ask's stub, that pings only them and
is tracked on the session as a chat refusal is; every way one
`injection-suspected` / `denied` SAFE-5 row is appended through the bridge's
trail (actor, surface `discord:<session>` for chat and the Answer form or
`discord:/<command>`, digest of the source and reason ids; best effort).
Otherwise a team / community speaker's words SHALL reach the model through
`fenceSpeakerText` (the `UNTRUSTED_DATA` fence with a header naming their role
and saying it is their request but data, not instructions; source
`chat-message`, `session-topic`, `work-task` or `ask-answer`); the owner's
words are unchanged. A button pick's answer is a model-written option label,
not typed text, and is neither fenced nor scanned. The spawn client SHALL read the child's `result.injection`
with `injectionNoticeFromUnknown` into `AgentSpawnResult.injection`, and the
post that carries a run's answer SHALL then ping the owner with
`formatInjectionOwnerLine`: chat and button-pick replies (`withInjectionNotice`,
with the SAFE-8 warning), `/session start` and `/work` (`slashOwnerNotice`
`injection`) and a schedule run's result post or ask post. Replayed session
turns SHALL strip invisible characters and mark a line that imitates a
Corvidinho block or a turn label (`Human:`, `You (Corvidinho):`) `(quoted)`,
so an earlier message cannot close the replay block or pass for a turn of
Corvidinho's own; recalled
memory lines SHALL strip invisible characters. `discord-user-lookup` names are
cleaned (REQ-plugins-071). No env var, config key, table or column.

Acceptance Criteria
- Through `startBridge` with a memory DB: a stranger's injection starts no run, gets one reply to the message that pings only the owner, ends the session it started and appends one `injection-suspected` / `denied` row with the stranger as actor; a declared team member's injection is refused too; the owner's own words run unfenced.
- An ordinary stranger message runs with the words inside the fence (`role: community`, `source=chat-message`), the display name cleaned and a `name_clash` line; a run reporting `injection` gets the owner line and the owner in its allowed mentions.
- `/session start` and `/work`: a stranger's injection creates no session and runs nothing, the interaction gets the refusal, the owner a fresh ping post, the trail one `denied` row; an ordinary stranger request runs fenced and the owner's unfenced.
- `slashOwnerNotice` and `withInjectionNotice` carry the SAFE-13 owner line and the owner mention; no notice leaves a post unchanged.
- The replay block marks a turn line that imitates its footer or a turn label `(quoted)` and still ends with its own footer.
- A schedule run reporting `injection` pings the owner with the SAFE-13 line on its result post and, when it ends with an ask, on its ask post.
- A non-owner's free-text answer to a pending ask reaches the model inside the fence (`tests/discord.slash-pending-ask.test.ts`).
- The private Answer form: a community user's and a declared team member's injected submit starts no run, gets an ephemeral refusal, keeps the ask and the session, pings only the owner once in a post replying to the stub and appends one `denied` row with surface `discord:<session>`; an ordinary community answer runs inside the fence (`source=ask-answer`); the owner's answer runs unfenced and unscanned (`tests/safe.injection.test.ts`, `tests/discord.ask-answer-modal.test.ts`).
- Regression tests in `tests/safe.injection.test.ts` fail on the base sources and pass after.
