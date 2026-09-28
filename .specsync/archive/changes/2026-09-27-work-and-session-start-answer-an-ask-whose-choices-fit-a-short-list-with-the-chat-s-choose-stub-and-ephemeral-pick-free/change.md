---
id: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
state: archived
type: feature
base_commit: 1c7b6ced470e0ed87e4c854f2663111713af3fa7
---

# /work and /session start answer an ask whose choices fit a short list with the chat's Choose stub and ephemeral pick, free text only when the options cannot be listed (DISCORD-ASK-1/4)

## Intent

/work and /session start answer an ask whose choices fit a short list with the chat's Choose stub and ephemeral pick, free text only when the options cannot be listed (DISCORD-ASK-1/4)

## Affected Canonical Specs

- `discord`

## Acceptance Criteria

- A /work or /session start run that stops with a clarify or stuck ask whose choices fit a short list (ask-human options, or a numbered list in the question) answers in one message with the chat's public Choose stub (no question, options or reply hint in it; one Choose button), keeps the ask with its options and stub message id as the session's pending ask, and the requester's Choose press opens the ephemeral options whose pick resumes that same session in the stub; the Choose button stays on the fallback reply and on the owner-notice re-edit; an ask whose options cannot be listed stays the free-text ask and a spend-cap stop is never a button ask or pending; tests/discord.slash-choose-ask.test.ts covers each and its bridge tests fail on the previous code

## No-spec Rationale

Not applicable
