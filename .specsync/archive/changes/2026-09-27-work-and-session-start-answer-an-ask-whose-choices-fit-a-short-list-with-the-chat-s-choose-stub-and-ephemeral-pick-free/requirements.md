---
change: work-and-session-start-answer-an-ask-whose-choices-fit-a-short-list-with-the-chat-s-choose-stub-and-ephemeral-pick-free
artifact: requirements
---

# Requirements

- Modified REQ-discord-044 (delta `deltas/discord.md`): a `/work` or
  `/session start` ask whose choices fit a short list (ask-human options, or
  a numbered list in the question) answers with the public Choose stub and
  its button, keeps the ask with its options and the stub message id as the
  pending ask, and the requester's Choose press / pick resumes that session
  in the stub; the button stays when the owner notice is appended; free text
  only when the options cannot be listed; a spend-cap stop never gets
  buttons. The two acceptance bullets that pinned "options dropped" are
  narrowed to asks whose options cannot be listed, and six bullets are added.
- REQ-discord-045 (Choose stub, ephemeral options, ~30 min expiry, free text
  only when options cannot be listed) is unchanged; the slash path now meets
  it too.
- HI: DISCORD-ASK-1, DISCORD-ASK-4 (with DISCORD-ASK-2/3/5/6/7/8,
  AUTONOMY-1/2/4/5/6, SAFE-8, SESSION-MULTI-1/3 unchanged). No acceptance
  criteria beyond these captured ids.
