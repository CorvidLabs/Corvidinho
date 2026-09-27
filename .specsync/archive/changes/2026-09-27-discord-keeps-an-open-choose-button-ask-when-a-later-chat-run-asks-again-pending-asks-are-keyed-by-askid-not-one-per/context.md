---
change: discord-keeps-an-open-choose-button-ask-when-a-later-chat-run-asks-again-pending-asks-are-keyed-by-askid-not-one-per
artifact: context
---

# Context

HI (captured, `hi/session.md`): **SESSION-MULTI-3** — "The same user can keep
chatting while buttons are open; new messages continue their conversation;
buttons remain until press or timeout (do not replace pending ask on a new
message)."

Gap on main (1c7b6ce, re-checked on 0940db3 after #244): the session held one `pendingAsk`. A chat message sent
while a Choose ask was open ran the agent; when that run asked again,
`bridge.ts` called `store.setPendingAsk(session, pendingToStore)`, which
overwrote the open button ask. `onComponent` found the session by
`s.pendingAsk?.askId === parsed.askId`, so the earlier Choose / option
buttons answered "This choice isn’t for you (or it was already answered)."
before any press or timeout. Repro (bridge fixture, main source): open ask A,
side-chat run asks B, press A's Choose → "This choice isn’t for you (or it was
already answered).", press A's option → same, no resume.

Constraints: no SQLite schema bump (the `pending_ask` TEXT column carries the
new shape), no new slash command / env / config key. Open PR #232 (ask-button
actor gate + mute/rate) touches the same `onComponent` block; this change
does not touch its gates.
