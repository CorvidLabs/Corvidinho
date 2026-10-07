---
module: discord
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
---

# Delta: discord (once a session question's buttons expire the session stops waiting; a schedule's questions still wait — AUTONOMY-6.b)

## Modified

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

"Once a session question's buttons expire, the session stops waiting and my
next message runs normally; a schedule's questions still wait until answered"
(AUTONOMY-6.b, captured with `hi` in this change from Leif's 2026-09-28
interview, round 17: keep as built). Past its ~30 minutes
(`ASK_BUTTON_TTL_MS` from when the ask is stored, DISCORD-ASK-5), a session's
button ask (chat, `/work`, `/session start` and their resumes) SHALL NOT keep
the session waiting: by the rule above, the requester's next message that is
not an explicit cancel, a thin reply included, SHALL run the agent as
ordinary chat with no prior-question block, unless an earlier button ask of
the session is still live (that one is restated, SESSION-MULTI-3). Inside the
window a thin reply SHALL still restate the live ask (AUTONOMY-5/6). A
free-text ask is unchanged (its question stays open for a reply after its
Answer button stops, DISCORD-ASK-4.a), and so is a cancel sent after the
expiry (the short ack, no run). Schedule asks never take this path
(REQ-discord-045, REQ-discord-606). No new env var, config key, slash
command, table or column.

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
- AUTONOMY-6.b on the real window: the ask's `expiresAt` is its ask time plus `ASK_BUTTON_TTL_MS`; with the clock one minute inside it a thin reply restates the Choose ask with its Choose button and runs nothing; one minute past it a thin reply, or a new request, runs the agent with no prior-question block, posts no stub or Choose button for that ask and leaves no pending or open ask; a late press on it gets `ASK_CHOICE_EXPIRED`, and a later thin reply runs too.
- AUTONOMY-6.b on the slash path: a reply `ok` to a `/session start` Choose answer restates it one minute inside the window, and one minute past it runs the agent with no prior-question block and leaves no pending ask.

### REQUIREMENT REQ-discord-045

When an ask has two or more options (from ask-human `options` or a numbered
list parsed from the question), the bridge SHALL post a short public Choose
stub with a button, and on requester press SHALL reply with an ephemeral
interaction listing the option buttons. Button prompts of a session ask
(chat, `/work`, `/session start` and their resumes) SHALL expire after
about 30 minutes; a late press SHALL get a short "that choice expired". A
schedule run's ask (REQ-discord-606, AUTONOMY-6.a) SHALL NOT lapse while it
is open: AUTONOMY-6.a makes the schedule wait until it is answered or
cancelled, so its Choose, Answer and Cancel controls work until then (the
ask is kept in SQLite, `schedule_runs`, and survives restarts); the
~30-minute expiry of DISCORD-ASK-5 stays for session asks only.
Free-text clarify SHALL be used only when options cannot be listed.

AUTONOMY-6.b states both halves of that split: once a session question's
buttons expire (~30 minutes) the session stops waiting on it and the next
message runs normally (REQ-discord-044), while a schedule's question still
waits until it is answered or cancelled: one minute past that same window,
and a day later, its controls still take presses and its schedule's due runs
are still skipped with one wait note (AUTONOMY-6.a, REQ-discord-606).

A late press SHALL include the requester's Choose or option press on an ask
that is no longer open because it timed out and was dropped, not promoted,
when a newer ask of the session was cleared (REQ-discord-044), or because its
session was TTL-purged (SESSION-2 / REQ-discord-019), at runtime or while the
store loads after a restart. Such a press SHALL get the ephemeral
`ASK_CHOICE_EXPIRED` reply, with no agent run, no new session and nothing
posted or edited, never "This choice isn't for you (or it was already
answered)". A still-stored ask past its timeout SHALL keep that reply and be
cleared, and a later press on it SHALL again get `ASK_CHOICE_EXPIRED`. A
re-press after a pick and a press after an explicit cancel SHALL stay no-ops
with today's reply (DISCORD-ASK-8), also once the session is purged. Another
user's press on a live ask, or on an ask that is no longer open, SHALL get
the not-for-you reply and SHALL NOT resume anything (DISCORD-ASK-2/3). The
channel, actor and mute/rate gates (REQ-discord-212 / REQ-discord-201 /
REQ-discord-010) SHALL run before this reply; for an ask that is no longer
open, the channel gate SHALL judge the press against the channel and thread
its session had, as for a live ask, so a late press in the talk's thread
under an allowlisted channel (DISCORD-2.a) gets `ASK_CHOICE_EXPIRED` too. To
tell a late press from another user's, `SessionStore` SHALL keep, for each
ask that leaves past its timeout or with its purged session, only its askId,
the session's Discord user, the ask's expiry and the session's channel and
thread ids (`findClosedAsk`), in memory only and bounded to the newest
`CLOSED_ASKS_MAX` (1000), never the question or option text (SAFE-6). No new
env var, slash command, table or column.

Acceptance Criteria
- Structured or numbered options → stub + components; ephemeral open shows choices.
- Pick resumes the requester session with the chosen label.
- Expired press returns ASK_CHOICE_EXPIRED and clears pending.
- Question without listable options keeps the free-text ask-ping path.
- When the newest ask is picked while an earlier open ask has timed out, the requester's Choose and option press on the dropped earlier ask each get exactly the ephemeral `ASK_CHOICE_EXPIRED`; the agent does not run and nothing is posted or edited; another user's press on it gets the not-for-you reply.
- With two open asks (neither timed out) and the session idle past its TTL, the requester's Choose and option press on each get the ephemeral `ASK_CHOICE_EXPIRED`, no agent run, no session is created and nothing is posted; another user's press on each gets the not-for-you reply, as it does on the live ask before the purge.
- A still-stored ask past its timeout: the first press gets `ASK_CHOICE_EXPIRED` and clears it; a second press by the requester gets `ASK_CHOICE_EXPIRED` again, another user's the not-for-you reply, and the agent does not run.
- A re-press after a pick and a press after `cancel` get the not-for-you / already-answered reply with no run, before and after the session is TTL-purged.
- A muted or deny-listed requester's press on an ask of a TTL-purged session gets `MUTED` / the zero-width ack; once let through the press gets `ASK_CHOICE_EXPIRED`, with no run and nothing posted.
- In a talk inside a thread under an allowlisted channel, the requester's press in that thread on a dropped ask or on an ask of the TTL-purged session gets `ASK_CHOICE_EXPIRED` with no run; another user's press there gets the not-for-you reply; a press from another thread or a non-allowlisted channel, or once the talk's channel has left the allowlist, gets the zero-width ack.
- `SessionStore.findClosedAsk` returns `{ askId, userId, expiresAt, channelId, threadId? }` (no question or option text) for an earlier ask dropped when the newest is cleared, an ask cleared past its timeout, every open ask of a TTL-purged session and every ask of a session row purged on load; never for a pick of a live ask, a cancel or an askId stored again; past `CLOSED_ASKS_MAX` the oldest is forgotten.
- A schedule ask recorded three days before the press still takes a pick from the owner (no "that choice expired"); session asks keep their ~30-minute expiry.
- AUTONOMY-6.b: with a session ask and a schedule ask of the same age, one minute past `ASK_BUTTON_TTL_MS` the requester's press on the session ask gets `ASK_CHOICE_EXPIRED`, the schedule creator's chat message runs and leaves the schedule ask open, and the schedule ask's Choose opens its choices and a pick closes it (`picked`).
- AUTONOMY-6.b: a schedule whose run asked stays blocked one minute past `ASK_BUTTON_TTL_MS` and a day later (each due run skipped, no run, one wait note, the ask still open) until the ask is answered; the next due run then starts with the answer in its prompt.
