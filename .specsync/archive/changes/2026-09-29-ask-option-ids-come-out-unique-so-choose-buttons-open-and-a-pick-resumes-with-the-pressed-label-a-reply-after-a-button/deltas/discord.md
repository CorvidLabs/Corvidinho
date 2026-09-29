---
module: discord
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
---

# Delta: discord (a reply after a button ask timed out clears it instead of restating a dead Choose button, DISCORD-ASK-5)

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
