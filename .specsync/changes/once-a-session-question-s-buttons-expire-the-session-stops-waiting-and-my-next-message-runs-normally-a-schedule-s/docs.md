---
change: once-a-session-question-s-buttons-expire-the-session-stops-waiting-and-my-next-message-runs-normally-a-schedule-s
artifact: docs
---

# Docs

- `docs/discord.md`:
  - Choose paragraph: "Buttons expire after ~30 minutes" now says that once
    a session question's buttons expire the session stops waiting on it and
    the next message runs normally (AUTONOMY-6.b), while a schedule's
    question still waits until it is answered.
  - "Scheduled questions wait for an answer": DISCORD-ASK-5's expiry is for
    chat and slash asks only, citing AUTONOMY-6.b.
  - Thin-reply paragraph: the expired-ask rule now leads with AUTONOMY-6.b
    (REQ-discord-044): the expired ask is dropped, the next message (a thin
    `ok` included) runs as ordinary chat with no prior-question block, a
    late press gets "that choice expired"; it holds for chat, `/work` and
    `/session start`; a free-text question stays open for a reply
    (DISCORD-ASK-4.a); a schedule's question never expires this way.
- `docs/DISCORD-GO-LIVE.md`: the schedule-question bullet adds that a chat
  or slash question's Choose buttons expire after ~30 minutes and then that
  session stops waiting (AUTONOMY-6.b).
- Specs: `discord.spec.md` (the pending-asks paragraph, an invariant, the
  new test in `files:`), `specs/discord/testing.md` (evidence),
  REQ-discord-044 / 045 through the delta.
- `hi/autonomy.md` and `INTENT.md` (criteria counts) from the `hi`
  capture.
- No README, CHANGELOG, STATUS or package.json edit (the release PR writes
  them).
