---
module: discord
change: a-stop-button-on-the-run-s-progress-message-lets-me-or-the-person-who-asked-stop-it-agent-3-a
---

# Delta: discord (a Stop button on the run's progress message for the person who asked or the owner — AGENT-3.a, AGENT-3.b)

## Added

### REQUIREMENT REQ-discord-303

In Discord I can stop a run with a Stop button, and so can the person who
asked (AGENT-3.a, captured in `hi/agent.md` from Leif's 2026-09-28
interview); after I stop a run, messages that were waiting still run, in
order (AGENT-3.b). The progress message of every chat run, ask pick or Answer
form resume, `/session start` and `/work` run SHALL carry, while the run
goes, one message component row with exactly one danger-style (red, style 4)
button labelled `Stop` whose custom id is `cvstop:<runId>` (the run's
`SessionRunControl` turn id; `buildStopComponents`, `stopRunCustomId`,
`parseStopRunCustomId`, `src/discord/run-control.ts`), through the optional
`components` of `ThinkingStatus`, `ThinkingOutbound.sendEmbed` and the live
gateway's `sendEmbed` (the in-memory outbound records them); on a reused
Choose or Answer stub (DISCORD-ASK-7) the Stop button SHALL take that
button's place for the run. Working edits SHALL leave it. The button SHALL be
cleared when the run is done, failed or stopped: the answer's edit
(`finalizeContent`: no components, or the answer's own Choose / Answer
button), the done / fail status edit (`editEmbed` with `components: null`,
which the live gateway sends as an empty list; also when the run throws), a
discarded progress message, and the restart's interrupted notice for a
progress message a dead process left (REQ-discord-311). A progress message
without components is edited exactly as before.

A press of the Stop button SHALL be handled in its own `onComponent` branch
(apart from the Approve cards' `cvok:`, the asks' `cvask:` and any other
prefix such as a later `cvstop-…`); a form submit carrying a Stop custom id is
ignored. The press SHALL pass, in order, the channel gate
(`componentChannelAllowlisted`, REQ-discord-212: the press channel and the
pressed message's talk — the session of the run that message shows while it
runs, else the session its finished answer is tracked on, else the press
channel alone), the actor gate (REQ-discord-201) and the mute / rate gate
(REQ-discord-010), with the same ephemeral refusals as an ask press (the
zero-width ack, the owner's allowlist tip, `MUTED` / `RATE_LIMITED`);
refused, it stops nothing. The run it may stop is the one the pressed message
shows running (`byProgressMessage`), in the press's channel, with the pressed
id; for anything else (a finished or stopped run's button, another run's id,
another channel, a button from before a restart) the press SHALL get only
the ephemeral `Nothing is running.` and stop nothing. From anyone but that
run's requester or the configured owner (IDENTITY-1) it SHALL get only the
ephemeral `This Stop button isn't for you.` and the run goes on. From the
requester or the owner it SHALL stop the run through the same
`SessionRunControl.stop` as the stop words (REQ-discord-302: its signal
aborted once, the process tree killed, idempotent) and answer with the
ephemeral `⏹ Stopping the run.`; the stopped run then ends as REQ-discord-302
says (`⏹ Stopped` with the DISCORD-15 / 15.a footer, no question, a stopped
`/work` failed with no PR, the card pass). A second press, or a 'stop' reply,
while it winds down aborts nothing more and gets the same ack. Messages that
were waiting still run afterwards, in order, each with its own button
(AGENT-3.b). Stopping a schedule's run from Discord (Leif, round 13 of the
2026-09-28 record) is not part of this requirement. No new env var, config
key, slash command, table or schema change.

Acceptance Criteria
- A chat run's progress message is sent with one row holding one red `Stop` button (`cvstop:run_<n>`); working edits carry no components; the requester's press gets only the ephemeral `⏹ Stopping the run.`, aborts the run once, posts nothing public, and the progress message becomes `⏹ Stopped` with `<model> | <time>` in the error colour and its components cleared; a later press gets `Nothing is running.`.
- A third user's press gets only `This Stop button isn't for you.` and the run goes on; the owner's press on someone else's run stops it and starts no session of the owner's.
- A finished run's answer clears its button; its button afterwards, the live run's id on another message, another run's id on the live message, the live button pressed in another allowlisted channel and a pre-restart button in the allowlisted channel all get `Nothing is running.` and abort nothing; a pre-restart button in a thread no session is known for gets the zero-width ack.
- A failed run's answer clears the button, and so does the failure status when the run throws.
- With the run's thread deny-listed, a press gets the zero-width ack (the owner: the allowlist tip); deny-listed, the zero-width ack; muted, `MUTED`; none of them stops the run; a form submit with the Stop id gets nothing and stops nothing; past the gates the press stops it.
- A second press, and a 'stop' reply, while the run winds down get the ack and abort nothing more: one abort, one `⏹ Stopped`.
- After a Stop press two waiting messages run in order, each with its own Stop button (three distinct ids), and every progress message ends with its components cleared.
- A pick's resumed run: the stub's Choose button is replaced by the Stop button, a press stops the run, and `⏹ Stopped` clears it.
- `/session start` and `/work`: the progress message carries the button; a press stops the run; a stopped `/work` says `PR: not opened — the run was stopped.` and is `failed` / `stopped`.
- The restart's interrupted notice edits the progress message with `components: null`.
- `ThinkingStatus`: components go out with the progress embed (or on a reused stub, by `editMessage` else `editEmbed`), working edits leave them, `done` and `fail` send `components: null`, the collapsed answer carries none or the answer's own; without components no call carries a `components` field and a reused stub's button is still cleared.
- `parseStopRunCustomId`: `cvstop:run_7` gives `run_7`; `cvstop-schedule:run_7`, extra parts, a missing or malformed id, an ask's or a card's custom id give null.
- With the base's sources these tests fail; they pass on the branch.

## Modified

### REQUIREMENT REQ-discord-302


In Discord I can stop a run by saying stop or cancel, and so can the person
who asked (AGENT-3.a; AGENT-3: it actually stops instead of finishing in the
background); after I stop a run, messages that were waiting still run, in
order (AGENT-3.b). This requirement is the stop words; the Stop button
(AGENT-3.a) on the progress message is REQ-discord-303, which stops a run
through the same stop, and stopping a schedule's run from Discord is a later
slice. A
message whose whole text (mentions and the IDENTITY-5 mention trailer left
out, any case, trailing `.` / `!` allowed; `isStopRunText`) is 'stop' or
'cancel' SHALL stop the run in flight when it comes (a) from the requester in
their session — the router gives `continue_session` for their own session and
a turn of that session is running — or (b) as a reply to that run's progress
message (the chat progress message, the Choose stub a pick resumed in, or the
`/session start` / `/work` progress message), in that message's own channel,
from the run's requester or the configured owner (IDENTITY-1): the router's
`stop_run` route, checked right after the channel gate and before the thread
and bot-message lookups (REQ-discord-002's exception), past the actor gate
(REQ-discord-201) and the mute/rate gate (REQ-discord-010). The stop SHALL
never wait in the session's queue. `SessionRunControl.stop` SHALL abort the
running turn's signal once (idempotent; a second stop while it winds down
aborts nothing more), which kills the run's whole process tree through the
spawn client (`killProcessTree`); a waiting turn is never stopped or dropped,
so the messages that were waiting still run afterwards, in order. Each stop
message SHALL get one short reply, `⏹ Stopping the run.` (`RUN_STOP_ACK`),
tracked on the run's session. The stopped run's answer SHALL be
`⏹ Stopped` (`RUN_STOPPED_TEXT`), edited into its progress message (or, with
no editable message, the fallback status and reply) with the DISCORD-15 /
15.a footer — the model and time for everyone, tokens and cost only on the
owner's own runs — in the error color; a question the stopped run raised is
dropped (never stored as a pending ask or posted), `⏹ Stopped` joins the
session's thread as the answer, the stop message itself does not, and on the
chat path a free-text pending ask is cleared as after any turn that asks
nothing. A stopped
`/session start` answers its head lines and `⏹ Stopped`; a stopped `/work`
SHALL be recorded `failed` with the summary `stopped`, SHALL open no PR (`PR:
not opened — the run was stopped.`) and answers `⏹ Stopped`. A stop that
lands after the `/work` agent exited but before its PR step SHALL still open
no PR (the same PR line; a run that had finished cleanly is recorded `failed`
/ `stopped`). After a stopped
turn finishes the bridge SHALL run an Approve/Deny card pass, so a card the
killed run was waiting on (its waiting process gone) closes as a no at once
(SAFE-20; otherwise on the engine's next poll). With no run of the session in
flight the words SHALL keep today's behaviour: 'cancel' clears the open asks
(AUTONOMY-6, REQ-discord-044) and 'stop' is an ordinary message; anyone else's
reply to a progress message routes as before. No new env var, config key,
slash command, table or schema change.

Acceptance Criteria
- The requester's 'stop' in their thread while its run is going: the run's signal is aborted once, one `⏹ Stopping the run.` reply to the stop message, the progress message becomes `⏹ Stopped` with a footer-only error embed `<model> | <time>`; `⏹ Stopped` is in the session's thread and `stop` is not.
- The owner's own stopped run shows `<model> | <tokens> tokens | $<cost> | <time>`.
- 'cancel' as a reply to the running progress message (not a tracked bot message) stops it.
- The owner's 'stop' reply to someone else's running progress message stops it and starts no session of the owner's; a third user's 'stop' reply stops nothing and gets no reply.
- A second 'stop' while the run winds down aborts nothing more: one abort, one `⏹ Stopped`, one ack per stop message.
- Two messages waiting behind a stopped run run after it, in order, and are not aborted.
- With nothing running, 'cancel' clears an open ask with `ASK_CANCELLED_ACK` and 'stop' runs the agent with the text 'stop'.
- A pick's resumed run stops by a 'stop' reply to its Choose stub.
- `/session start` and `/work` stop by a 'stop' reply to their progress message; the stopped `/work` answer says `PR: not opened — the run was stopped.` and the task is `failed` / `stopped`.
- A 'stop' reply that lands after the `/work` agent exited (while its private reply's DM is still going out) gets the ack; the answer says `PR: not opened — the run was stopped.` and the task is `failed` / `stopped`.
- 'cancel' while a chat run is going and a button ask of the session is open stops the run with the stop ack only and leaves that ask pending.
- The real spawn client over a fake agent bin: the agent process and the background process it started are both gone after the stop.
- A fake agent bin that raised a must-ask Approve card (itself the waiting process) and waits: after the stop the card's request is `expired` (closed as a no).
- `routeMessage`: a reply 'stop' / '<@bot> cancel' to a running progress message that is also a tracked bot message gives `stop_run` for the requester and the owner; 'stop it', a third user, the same reply in another allowlisted channel, or a finished run route as before; a deny-listed requester is refused quietly.
- `isStopRunText`: true for `stop`, `Stop`, ` STOP. `, `cancel`, `Cancel!`, `stop!!`; false for `stop it`, `please stop`, `cancel that`, `stopped`, empty, `nevermind`, `don't stop`.
- A Stop press (REQ-discord-303) and a 'stop' reply to the same running progress message go through the same `SessionRunControl.stop`: the run is aborted once and the reply still gets its `⏹ Stopping the run.` ack.

### REQUIREMENT REQ-discord-548


When a clarify or stuck ask's choices cannot be listed (the free-text ask of REQ-discord-044 / REQ-discord-045), its public post SHALL stay the short stub that quotes the question and SHALL carry exactly one **Answer** button; the requester's press SHALL open a private form (a Discord modal, interaction response type 9) with one paragraph text input, and the form's submit (interaction type 5, MODAL_SUBMIT) SHALL pass the same gates as a button press and resume the requester's session exactly as a reply that answers the ask would (DISCORD-ASK-4.a, with DISCORD-ASK-2/3/5/7/8). Replying in the channel SHALL still answer it.

- The post is `formatAskReply` (question quoted, requester or owner mention as before) with the hint `ASK_ANSWER_HINT` ("Press **Answer** to answer privately, or reply to this message.") in place of `ASK_REPLY_HINT`, and `buildAnswerStubComponents(askId)`: one Primary button labelled `Answer` on the ask's `open` custom_id. It applies to the chat answer, the follow-up ask of a resumed pick or form submit, the `/work` and `/session start` answer, and a thin-reply restatement while the ask has not timed out (after that the restatement has no button and the reply hint, as before). The post keeps its footer-only embed (it is still the turn's answer, DISCORD-3.a) and its message id is stored as the ask's `stubMessageId`. A SAFE-8 spend-cap stop gets no button and is never pending; a Choose ask (listable options) keeps its Choose stub; a lone option is dropped (free text). A schedule run's free-text ask carries the same Answer button (on its run id, `cvask:open:srun_<id>`) plus Cancel, and its form's submit closes the schedule's ask instead of resuming a session; a reply does not answer it (REQ-discord-606).
- The requester's press on the Answer button (an `open` press on a pending ask without options) SHALL answer with the modal `buildAnswerModal`: `custom_id` `cvask:answer:<askId>`, title `Answer privately`, one Label component (type 18) `Your answer` whose description is the SAFE-6 scrubbed, defanged, one-line start of the question (≤100 chars), around one required paragraph text input (type 4, style 2, `custom_id` `answer`, `min_length` 1, `max_length` `ASK_ANSWER_MAX` = min(`ASK_QUESTION_MAX`, 4000)). The press posts nothing and runs nothing; the ask stays pending. Without a modal-capable interaction the press keeps today's ephemeral "reply in the channel instead".
- The live gateway SHALL route a MODAL_SUBMIT to the component handler with the form's text input values by input custom_id (`modalValues`); its replies parse no mentions and an ephemeral reply is flag 64. Only the form's `answer` custom_id with typed text is taken; a press id with typed text or the form id without it is ignored.
- The submit SHALL pass, in order, the channel gate (REQ-discord-212), the actor gate with deny lists and a non-empty user/role allowlist (REQ-discord-201), mute/rate (REQ-discord-010), the not-yours / already-answered check and the expiry check, exactly as a press; every refusal is ephemeral only (zero-width ack, the admin allowlist tip, `MUTED` / `RATE_LIMITED`, "This choice isn't for you (or it was already answered)", `ASK_CHOICE_EXPIRED`), with no agent run, nothing posted or edited and the ask left pending (DISCORD-DENY). A submit on a Choose ask gets the not-for-you reply.
- A submit whose scrubbed text is thin or an explicit cancel SHALL be handled as the same text in a reply is (AUTONOMY-5/6): a thin or blank answer (`isThinAck`: `ok`, `sure`, emoji-only, whitespace and similar) SHALL NOT clear the ask or run the agent — the question is restated once, privately (an ephemeral `formatAskReply` with `ASK_ANSWER_HINT` and the Answer button); an explicit cancel (`isCancelAsk`: `cancel`, `never mind`, `forget it`, `stop asking`, `nm`) SHALL clear every open ask of the session, as a cancel reply does (SESSION-MULTI-3), with the ephemeral `ASK_CANCELLED_ACK` and no run. Neither posts or edits anything in the channel.
- An accepted submit SHALL be SAFE-6 scrubbed, control characters dropped, trimmed and cut at `ASK_ANSWER_MAX` (`normalizeAskAnswer`); the ask SHALL be cleared first (a reply or second submit cannot resume twice); the submit gets the ephemeral `ASK_ANSWER_ACK`, deleted when the resumed run ends (DISCORD-ASK-8); the session SHALL resume (`resume: true`) with its thread replayed and the prompt `[Prior clarifying question you asked (the human is answering it now):\n<question>]\n\nHuman answer:\n<answer>` — the block a reply that answers the ask gets, `<answer>` being the answer as the same words in a reply reach the model: inside the `fenceSpeakerText` untrusted-data fence (header naming the role, `source=ask-answer`) for a team or community requester, unchanged for the owner (SAFE-12, REQ-discord-071) — with `humanText`, the memory query and the recorded human turn the scrubbed answer (not the fence), the presser's identity, memory and acting role as on a button pick, and the stub as the progress surface (content cleared, its Answer button replaced by the run's Stop button while the run goes, REQ-discord-303) edited into the answer (DISCORD-ASK-7), which clears the Stop button. The typed text SHALL NOT be posted.
- Before the ask is cleared, a team or community requester's scrubbed answer (not thin, not a cancel) SHALL be scanned by `inboundInjection` exactly as the same words in a chat reply in that session are, and a hit SHALL be refused as that reply is (SAFE-13, REQ-discord-071; `refuseInjectedAnswer`): no agent run, the ask left pending and the session live, nothing added to the thread; the submit gets an ephemeral refusal (`injectionRefusalHead` plus "I've flagged it to the owner", never the text; without an owner or a post function the `formatInjectionRefusal` line, ephemeral); the owner gets one fresh post in the session's channel (thread first), replying to the ask's stub, that pings only them (allowed mentions the owner only) and says an answer typed in the private Answer form looked like a prompt-injection attempt and why; that post is tracked on the session as a chat refusal is; and one `injection-suspected` / `denied` SAFE-5 row is appended (actor the requester, surface `discord:<session>`, digest of `ask-answer` and the reason ids). The owner's own answer is neither scanned nor fenced. The presser's acting role SHALL be resolved before this check by `resolveDiscordActingRole` with the presser's Discord role ids, as on the chat path (the same role a button pick runs with), so a declared team member allowlisted only by a Discord role is team on the form as in chat (REQ-discord-065).
- A button pick's answer is the label of the pressed option, which the model wrote but may have copied from a non-owner's own (fenced) words: for a team or community presser it SHALL reach the resumed run as their words, inside the same `fenceSpeakerText` untrusted-data fence as their typed answer (header naming the role, `source=ask-pick`), the role being the presser's, resolved at press time by `resolveDiscordActingRole` with their Discord role ids as on the Answer form (SAFE-12.a, REQ-discord-071); the label is fenced, not scanned. `humanText`, the memory query and the recorded human turn stay the plain label. The owner's pick SHALL reach the run byte-identical to before (`[Prior clarifying question you asked (the human answered via Discord button):\n<question>]\n\nHuman answer:\n<label>`). The pick's claim of the ask and resume (DISCORD-ASK-3), expiry (DISCORD-ASK-5) and the option buttons cleared at once with "Got it — **<label>**" (DISCORD-ASK-8) are unchanged.
- A pick whose option id matches none of the pressed ask's options (a forged or stale id, or a pick id on a free-text ask) SHALL be treated as expired once it has passed the gates above: the ephemeral `ASK_CHOICE_EXPIRED` only, no agent run, nothing posted or edited, the ask left pending (a real pick, answer or reply still answers it) and the raw option id in no prompt and no thread turn (SAFE-12.a).
- A press or submit on a free-text ask past its ~30-minute timeout SHALL get `ASK_CHOICE_EXPIRED` and run nothing, and the ask SHALL stay pending so a reply still answers it with the prior-question block (unlike a Choose ask, which a late press clears, REQ-discord-045). A reply that answered the ask leaves the Answer button answering "already answered".
- No new env var, config key, slash command, table, column or schema version.

Acceptance Criteria
- A chat clarify ask without listable options: the collapsed stub quotes the question, carries `ASK_ANSWER_HINT` (not `ASK_REPLY_HINT`), exactly one Answer button (`open` custom_id) and a footer embed; the pending ask is free text with the stub as `stubMessageId`. A spend-cap stop has no button and no pending ask.
- The requester's Answer press calls `showModal` with `buildAnswerModal` (title ≤45, one type 18 label ≤45 with the question as description, one required type 4 paragraph input, `max_length` `ASK_ANSWER_MAX` ≤ 4000); nothing is posted, no run, the ask stays. Another user's press gets the not-for-you reply and no form.
- The requester's submit resumes the same session with the reply's prior-question block and the trimmed answer (a community requester's inside the untrusted-data fence, `source=ask-answer`); ephemeral `ASK_ANSWER_ACK` then deleted; the stub is thin-updated (content cleared, the Answer button replaced by the run's Stop button, REQ-discord-303) and edited into the answer, which clears the Stop button; the typed text is never posted; the ask is cleared and a second submit is "already answered". A secret in the text never reaches the run or the thread.
- Another user's, a muted, a deny-listed (user or role), an off-channel, a rate-limited and a late submit (and the same presses) are refused ephemerally with no run and the ask kept; after the late one a thin reply restates without a button and a reply still answers it.
- A reply to the stub answers the ask as before; a later Answer press or submit is "already answered". A thin reply restates with the live Answer button.
- A thin or blank submit (`ok`, whitespace, `👍`, `sure!`) gets only the private restatement with the Answer button: no run, nothing posted, ask kept, nothing added to the thread; a real submit afterwards resumes. A `never mind` / `cancel` submit gets only the ephemeral `ASK_CANCELLED_ACK`, clears the free-text ask and an earlier open Choose ask of the session, runs nothing, and a later Answer press is "already answered".
- `/work` without listable options answers with the Answer button and hint and records `stubMessageId`; its submit resumes that session in the answer message. A follow-up free-text ask from a resumed run gets its own Answer button in the same stub.
- The live gateway routes a MODAL_SUBMIT with its text to the component handler; `adaptModalSubmit` maps text inputs by id, replies ephemerally with no parsed mentions.
- Through `startBridge` with a memory DB: a community user's and a declared team member's submit that tells the bot to ignore its rules starts no run, gets one ephemeral refusal that never quotes it, leaves the ask pending and the session live (the refusal post continues it), adds nothing to the thread, posts once in the session's channel replying to the stub with allowed mentions only the owner, and appends one `injection-suspected` / `denied` row with the user as actor and surface `discord:<session>`; an ordinary community answer runs inside the fence with `humanText` and the thread turn the plain answer and no audit row; the owner's answer, injection-like words included, runs unfenced with no refusal and no row (`tests/safe.injection.test.ts`).
- A declared team member allowlisted only by a Discord role (a non-empty user / role allowlist) whose chat run is team answers through the form as team too: the run's acting role is team and the fence header names `team` (`tests/safe.injection.test.ts`).
- Through `startBridge` with a memory DB: a community user's and a declared team member's pick resumes the session with the label inside the fence (`role: community` / `role: team`, `source=ask-pick`) after the button prior-question block, `humanText` and the thread turn the plain label, the option buttons cleared with "Got it" and no audit row; a label repeating a community user's injection-like words stays fenced when they pick it; a declared team member allowlisted only by a Discord role picks as team; the owner's pick of an injection-like label resumes unfenced with no refusal and no row; a community user's, a team member's and the owner's press on an option id the ask does not have gets only `ASK_CHOICE_EXPIRED` with no run, nothing posted and the ask kept, a real pick then resumes with the label and no prompt holds the forged id; a pick press on a free-text ask is treated the same and the Answer form still answers it (`tests/safe.injection.test.ts`); a community presser's pick in `tests/discord.ask-ephemeral.test.ts` reaches the run fenced (`source=ask-pick`).
- These tests fail on the base sources.
- A schedule run's free-text ask post carries Answer + Cancel; its Answer opens the same private form (custom_id `cvask:answer:srun_<id>`), whose submit by the creator or the owner closes the ask (REQ-discord-606).
