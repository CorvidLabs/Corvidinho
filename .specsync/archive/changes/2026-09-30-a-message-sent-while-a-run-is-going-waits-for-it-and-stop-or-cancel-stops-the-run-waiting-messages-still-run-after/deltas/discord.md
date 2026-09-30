---
module: discord
change: a-message-sent-while-a-run-is-going-waits-for-it-and-stop-or-cancel-stops-the-run-waiting-messages-still-run-after
---

# Delta: discord (one run at a time per session; 'stop' / 'cancel' stops the run in flight; waiting messages still run — AGENT-3.a, AGENT-3.b)

## Added

### REQUIREMENT REQ-discord-301

A message sent while a run is going waits for it instead of starting a second
run (AGENT-3.a, captured in `hi/agent.md` from Leif's 2026-09-28 interview),
and after a stop the waiting messages still run, in order (AGENT-3.b, captured
in this change's PR from Leif's 2026-09-30 decision, round 13 of that record).
The bridge SHALL run at most one turn at a time per Discord session
(`SessionRunControl`, `src/discord/run-control.ts`): each chat message routed
to a session (`start_session` / `continue_session`), each ask pick or Answer
form submit that resumes one, and each `/session start` and `/work` run SHALL
take a turn on its session's queue (`enqueue`) before anything of it runs, and
SHALL release it (`done`) on every exit path. A turn queued behind a running
or waiting turn of the same session SHALL wait until every earlier turn of
that session is done, first in first out, and SHALL then go on exactly as if
its message had just arrived (the pending-ask expiry, thin-ack, cancel,
injection and pending-answer rules, and the thread replay of REQ-discord-072,
all see the earlier run's outcome). Turns of different sessions SHALL NOT
wait for each other. A waiting message SHALL get no new indicator: its normal
progress message is sent when its turn starts. A chat message that waits
SHALL have its in-flight row (REQ-discord-311) recorded when it starts
waiting, without a progress message until its turn starts; a pick's row is
recorded before it waits too. After waiting, a turn whose session was ended or
idled out (`SessionStore.get` no longer returns that session) or whose
requester was forgotten meanwhile (MEMORY-ACL-6 `onForgotten` →
`noteForgotten`), or that would no longer pass the gates it passed when it
came in, SHALL run nothing, post nothing and clear its row: `/admin` list
changes and mutes are live, so a chat message is checked again for its own
channel (still allowlisted, not deny-listed: DISCORD-5, REQ-discord-212), its
author's actor gate (REQ-discord-201, DISCORD-DENY-1) and mute (DISCORD-6)
(`waitedMessageStillAllowed`, `src/discord/message-router.ts`), and a pick or
Answer submit for the press and session channels (`componentChannelAllowlisted`),
the presser's actor gate and mute (`waitedPressStillAllowed`); the rate limit
is not counted again. Each turn
SHALL carry an `AbortSignal` that its run passes to the spawn client
(`AgentRunChatOpts.signal`, which kills the run's process tree), and its
progress message SHALL be mapped to it while it runs (`setProgressMessage`,
`byProgressMessage`). The bridge's `stop()` SHALL `close()` the control
first: every running turn's signal is aborted (reason `closed`), no waiting or
later turn starts, and such a turn posts nothing and keeps its in-flight row,
so the next start marks that reply interrupted (REQ-discord-311); the stop
then waits at most `ABANDONED_SETTLE_MS` for the turns to finish (`settle`).
A `closed` `/work` posts nothing and stays `running` until restart recovery
fails it (SESSION-WORKTREE-3). Nothing is persisted: the queue is in memory.
No new env var, config key, slash command, table or schema change.

Acceptance Criteria
- A second message in the same session while its run is going starts no second run and sends no second progress message; when the first run's answer is out it runs in the same session (`resume: true`), with that answer in its replayed thread, and gets its own progress message then.
- Three messages in one session run one after another, in the order sent.
- Runs of different sessions (another user's thread session, another channel) are in flight at the same time.
- A waiting chat message has its in-flight row (no progress message) while it waits; the row gets its progress message when its turn starts and is gone when it finishes.
- A message whose session ended while it waited runs nothing and posts nothing.
- A waiting message whose author is muted or deny-listed, or whose thread is deny-listed, while it waits runs nothing, posts nothing and leaves no in-flight row; a waiting Choose pick whose presser is muted meanwhile does not resume (its ephemeral ack is deleted).
- A Choose pick made while a chat run of its session is going waits for it, then resumes with the picked label and that run's answer in its thread.
- `/session start` and `/work` hold their new session's turn: the requester's @mention in that channel while the run is going waits for it.
- The bridge's stop aborts the run going, starts no waiting message, posts nothing, and leaves both replies' in-flight rows.
- `SessionRunControl`: FIFO per session, parallel across sessions, `done` idempotent; a turn released before its go never starts; `noteForgotten` marks a waiting turn's requester forgotten; after `close` the running turn is aborted (`closed`) and no waiting or new turn starts.

### REQUIREMENT REQ-discord-302

In Discord I can stop a run by saying stop or cancel, and so can the person
who asked (AGENT-3.a; AGENT-3: it actually stops instead of finishing in the
background); after I stop a run, messages that were waiting still run, in
order (AGENT-3.b). This change builds the stop words; the Stop button
(AGENT-3.a) and stopping a schedule's run from Discord are later slices. A
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

## Modified

### REQUIREMENT REQ-discord-002

The system SHALL continue the same session id when a user replies to a bot message (DISCORD-2). Inside a Discord thread the system SHALL keep one session id for that thread (DISCORD-2.a), one for each user in it (SESSION-MULTI-1, REQ-discord-046).

Exception (AGENT-3.a, REQ-discord-302): a reply whose whole text is 'stop' or
'cancel' to the progress message of a run still in flight, in that message's
own channel, from the run's requester or the configured owner, SHALL stop that
run (`stop_run`) and SHALL NOT continue or start a session. That route SHALL
be checked right after the channel gate, before the thread lookup and before
`getByBotMessage`, because a pick's progress message is the tracked Choose stub.

Acceptance Criteria
- Reply referencing a tracked bot message resumes that session id.
- Thread map keeps one session per thread for each user, keyed by thread id and Discord user id; another user's session in the thread never replaces it.
- The answer message of `/session start` and `/work` is a tracked bot message of the session that slash command created: the thinking message it was collapsed into (DISCORD-ASK-7), or, when collapse fails, the deferred slash reply when the gateway returns its message id.
- After a user runs `/session start` (or `/work`) twice (topics A then B), that user's reply to A's answer resumes session A, with the reply ping on and with it off; it never runs in session B and is never dropped.
- Another user's reply to that answer never resumes the session, even when that user is the configured owner (ADMIN) (SESSION-MULTI-1): with the ping off it is ignored, with the ping on it starts or continues that user's own session.
- A reply 'stop' or 'cancel' to the progress message of a run in flight, from its requester or the owner, stops that run and continues no session, even when that message is a tracked bot message (a pick's Choose stub); the same reply once the run finished, a reply with other text, or anyone else's reply routes as above (REQ-discord-302).

### REQUIREMENT REQ-discord-044

Sessions SHALL persist `pendingAsk` (including askId / expiresAt / optional
options). While set, a thin-ack continue SHALL restate the ask (stub+Choose
when options; formatAskReply when free-text) and SHALL NOT spawn the agent.
An explicit cancel SHALL clear pending ask. For free-text pending (no
options), a substantive continue SHALL clear pending and run the agent with
prior-question context. For button pending (has options), ordinary chat SHALL
continue the conversation WITHOUT clearing pending; only button pick, cancel,
or expiry SHALL clear it. Clarify asks SHALL mention the requester; stuck
asks SHALL mention the configured owner.

Pending asks SHALL be keyed by askId, not one per session (SESSION-MULTI-3).
When a later run of the same session asks again (a chat message sent while a
button ask is open, or the run a pick resumes), the new ask SHALL become the
session's `pendingAsk` (the one a thin-ack continue restates and a free-text
reply answers) and every earlier button ask SHALL stay open, so its Choose and
option buttons keep working until pressed or expired; a superseded free-text
ask is replaced. A button press SHALL be matched to the session's open ask
with that askId, whichever of its open asks it is. A pick, a late press or a
free-text answer SHALL clear only that ask, and the newest remaining open ask
that has not timed out SHALL become `pendingAsk` (earlier asks already past
their timeout are dropped then, never promoted, so a thin-ack continue never
restates expired buttons); an explicit cancel SHALL clear every open ask of
the session. Open asks SHALL persist in `discord_sessions.pending_ask` with
no schema change (one JSON object when one ask is open, as before; a JSON
array, oldest first, when several are) and reload with the session. No new
env var, config key, slash command, table or column.

A `/work` or `/session start` run that stopped with a clarify or stuck ask
SHALL store that ask as its session's pending ask, and `/work` SHALL record
the task `blocked` (a stuck ask stays `failed`), never `completed`
(AUTONOMY-1). When the ask's choices fit a short list (ask-human `options`,
else a numbered list parsed from the question, as in REQ-discord-045), the
slash answer SHALL be the public Choose stub with its Choose button, as in
chat (DISCORD-ASK-1/4): the stub SHALL NOT show the question or the options
(DISCORD-ASK-2), the stored pending ask SHALL keep the options and the answer
message id as its stub, and the requester's Choose press and pick SHALL
resume that session in the stub (DISCORD-ASK-3). The Choose button SHALL stay
on the answer when the owner notice has to be appended to it. When the
options cannot be listed, the pending ask SHALL be free text and the slash
answer SHALL show the question as text (DISCORD-ASK-4). The slash answer
message SHALL be bound to its session like a chat reply (DISCORD-2), so a
reply to it by the requester continues that session and the rules above apply
(AUTONOMY-5/6). A SAFE-8 spend-cap stop SHALL NOT be stored as the pending
ask and SHALL NOT get Choose buttons.

A continue that is not an explicit cancel, while the session's `pendingAsk`
is a button ask past its timeout, SHALL first clear that ask as a late press
does (`clearPendingAsk`), before the thin-ack rule applies: the newest
remaining open ask that has not timed out SHALL become `pendingAsk` (earlier
timed-out asks are dropped), so a thin-ack continue restates that live ask,
or, with none left, runs the agent, and SHALL NOT restate the timed-out ask's
stub or its Choose button (DISCORD-ASK-5). A substantive continue then runs
the agent as before, and an explicit cancel still clears every open ask with
the short ack and no agent run.

While a run of the session is in flight, a continue whose whole text is
'cancel' (or 'stop') SHALL instead stop that run (AGENT-3.a, REQ-discord-302)
and SHALL leave the session's open asks as they are; the cancel above applies
when nothing of the session is running.

Acceptance Criteria
- Clarify mentionUserIds is [requester] when provided; stuck is [owner].
- Thin ack restates; pendingAsk remains.
- Cancel clears pendingAsk.
- Free-text substantive continue clears pending and runs agent.
- Button pending survives unrelated chat turns until pick/cancel/expiry.
- `/work` with a clarify ask whose options cannot be listed: the task is `blocked`, the session's pending ask is the free-text clarify ask, and the collapsed answer message maps to that session.
- A thin reply (`ok`) to a free-text `/work` answer restates the question (requester mention, reply hint) and does not run the agent; the pending ask remains.
- `cancel` in reply to the `/work` answer clears the pending ask with the short ack and does not run the agent.
- A substantive reply to a free-text `/work` answer resumes the same session (`resume: true`) with the prior question and the human answer in the prompt, and clears the pending ask.
- `/work` or `/session start` stopped at the spend cap stores no pending ask; a later `ok` to the `/work` answer runs the agent with no prior-question or cap text.
- `/session start` with a clarify ask: the pending ask is stored; a thin reply restates, a substantive reply resumes with the question.
- `/session start` with a clarify ask that has a single structured option (not a list): the pending ask is free text (no options), so a substantive reply answers and clears it.
- `/work` with a stuck ask: the task is `failed`, the pending ask is stored; the owner is pinged once by the separate notice post (the answer itself pings nobody), and a thin reply restates the question with allowed mentions limited to the owner (never the requester).
- A reply to the `/work` answer by another user (`ok`, `cancel` or a substantive answer) neither runs the agent nor clears or restates the requester's pending ask (SESSION-MULTI-1).
- A finished `/work` run (`completed`) stores no pending ask and its answer still continues the session.
- Without an editable thinking message the pending ask is still stored, and an @mention `ok` from the requester restates it without running the agent.
- `/work` with a clarify ask that has structured options: the task is `blocked`; the collapsed answer is the Choose stub (requester mention and the Choose hint; no question, options or reply hint) with one Choose button, followed by the one requester ping post; the pending ask keeps the options with the answer message id as `stubMessageId`; the requester's Choose press opens the ephemeral question with the option buttons, and a pick resumes the same session (`resume: true`, the chosen label) with the answer edited into the stub.
- `/session start` with a numbered list in the question: the answer is the Choose stub, the pending ask holds the parsed options, and a pick resumes the same session.
- A thin reply to a slash Choose stub restates the stub with its Choose button without running the agent; a substantive reply continues the session and the button ask stays pending.
- `/work` with a stuck ask that has options: the task is `failed`, the Choose stub pings nobody and the owner is told by the separate notice post; when that post fails, the notice is appended to the stub and the Choose button stays.
- Without an editable thinking message, the deferred reply carries the Choose stub and its button, and its message id is the pending ask's `stubMessageId`.
- The stub's message id is recorded only while its ask is still the pending ask of a live session: a pick that already took the ask is not undone, and a session ended before the stub went out is not written back to the DB.
- The live gateway adapter forwards the Choose button on the deferred-reply edit and on a plain reply.
- A spend-cap stop never becomes a button ask, even with options.
- While Choose ask A is open, a chat message whose run asks again with Choose ask B makes B the pending ask and keeps A open: a thin reply restates B, A's Choose button opens A's choices, and a pick of A resumes the session with A's question and the chosen label while B stays pending; a re-press of A is a no-op; B's pick then resumes with B's question.
- While Choose ask A is open, a run that asks a free-text question F makes F the pending ask; a substantive reply answers F (prior-question context) and clears only F, so A is pending again and its buttons still resume the session.
- A late press on an earlier open ask gets `ASK_CHOICE_EXPIRED` and clears only that ask; the newer ask stays open.
- When the newest ask is picked while an earlier open ask has timed out, the earlier ask is dropped, not promoted: the session has no pending ask, a thin reply runs the agent, and a press on the dropped ask is a no-op.
- `cancel` with several open asks clears all of them with the short ack and no agent run; a later press on any of them is a no-op.
- `SessionStore`: one open ask persists as one JSON object; two persist as an array and reload as `pendingAsk` plus `openAsks` after a reopen; re-storing a held askId updates it in place; `findPendingAsk` finds an earlier open ask; clearing the newest promotes the earlier one; a new ask replaces a free-text ask but never a button ask; `null` clears all.
- A thin reply after the session's only button ask timed out runs the agent (no prior-question block), posts no restated stub or Choose button for that ask, and leaves no pending ask.
- A thin reply after the newest button ask timed out, while an earlier button ask is still open and not timed out, restates the earlier ask with its Choose button and does not run the agent; the earlier ask is the pending ask and no other ask stays open.
- A substantive reply after the button ask timed out runs the agent and leaves no pending ask, so a later thin reply runs the agent too.
- `cancel` after the button ask timed out still gets the short ack, runs no agent and leaves no pending ask.
- While a run of the session is in flight, 'cancel' stops that run with the short stop ack and leaves every open ask of the session open; with nothing running it clears them with `ASK_CANCELLED_ACK` as above (REQ-discord-302).
