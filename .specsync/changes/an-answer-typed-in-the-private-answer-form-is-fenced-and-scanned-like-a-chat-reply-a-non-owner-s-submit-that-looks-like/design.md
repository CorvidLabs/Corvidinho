---
change: an-answer-typed-in-the-private-answer-form-is-fenced-and-scanned-like-a-chat-reply-a-non-owner-s-submit-that-looks-like
artifact: design
---

# Design

- `src/discord/injection-guard.ts`: `SpeakerSurface` gains `ask-answer`.
  The body of `refuseInjectedSlash` becomes a private
  `refuseInjectedInteraction` (audit row, interaction refusal, owner post that
  pings only the owner; returns the post) shared by `refuseInjectedSlash`
  (output unchanged: public reply, `discord:/<command>`, "a /<cmd> request")
  and the new `refuseInjectedAnswer` (ephemeral refusal, surface
  `discord:<session>`, source `ask-answer`, owner post replying to the stub,
  "an answer typed in the private Answer form").
- `src/discord/bridge.ts` `onComponent`: the presser's people directory and
  acting role are resolved once, before the answer / pick branches (they were
  resolved inside the run's try; same inputs). In the answer branch, after the
  thin and cancel checks (the same order as chat: thin / cancel gate, then
  SAFE-13), `inboundInjection(answer, actingRole)`; on a hit
  `refuseInjectedAnswer` and `store.trackBotMessage(post ?? bot_reply_for_<ix>)`
  exactly as chat tracks its refusal, then return — the ask is not cleared,
  the session is not ended (a continue, as in chat), no turn is recorded.
  Otherwise the prompt's answer is `fenceSpeakerText(answer, role,
  "ask-answer")`; `humanText`, the memory query and the recorded turn stay the
  scrubbed answer (as chat keeps `prompt`). The pick branch passes its label
  through unchanged.
- No env var, config key, table, column or schema version.

Design choices pending Leif:

1. Where the refusal goes: chat's single public reply to the message can't
   notify the owner from an interaction, so the submit's refusal is ephemeral
   (the text was typed privately) and the owner gets one fresh public post in
   the session's channel, replying to the ask's stub. Alternative: a public
   interaction reply as `/work` does.
2. The ask stays open after a refused submit (as after a refused chat reply),
   so the requester can still answer by form or reply.
3. The button path's role resolution still omits the presser's Discord role
   ids (chat passes them), so an admin who is admin only through
   `adminRoleIds` is team / community on the button and form path (fenced and
   scanned). Left as it was: widening it is a role change outside this fix.
