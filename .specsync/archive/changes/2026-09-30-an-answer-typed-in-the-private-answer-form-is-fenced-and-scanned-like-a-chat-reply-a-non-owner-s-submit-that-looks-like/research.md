---
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
artifact: research
---

# Research

Every Discord path that puts human-typed text into a run (`runChat` callers
in `src/discord`):

| Path | Typed text | Before | After |
|---|---|---|---|
| Chat message / reply (incl. a reply that answers a free-text ask) | message | fenced + scanned (#295) | unchanged |
| `/session start` topic, `/work` description | slash option | fenced + scanned (#295) | unchanged |
| Answer form submit (MODAL_SUBMIT, DISCORD-ASK-4.a) | form text | **neither** | fenced + scanned like a chat reply |
| Button pick | none: the option label the model wrote (`findOptionLabel`), or the bot's own option id from the pressed button's custom_id | not fenced | unchanged (not typed text) |
| Thin reply / thin form answer (`isThinAck`) | restated, no run | — | unchanged |
| Cancel reply / form cancel (`isCancelAsk`) | no run | — | unchanged |
| Schedule ask answer (AUTONOMY-6.a) | not built on main: schedule asks post text; no answer path resumes a schedule run | — | nothing to fix |
| Scheduler tick run | the schedule's stored prompt (creator-written, not a resume) | — | out of scope |

The chat refusal is one public reply to the message; a modal submit is an
interaction, whose reply notifies no mention (the reason `refuseInjectedSlash`
pings the owner in a fresh channel post). The form's text was typed privately
and all form UI is ephemeral (DISCORD-ASK-2), so the submit's refusal is
ephemeral and the owner ping is a fresh post in the session's channel.
