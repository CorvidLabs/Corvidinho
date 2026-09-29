---
change: ask-option-ids-come-out-unique-so-choose-buttons-open-and-a-pick-resumes-with-the-pressed-label-a-reply-after-a-button
artifact: docs
---

# Docs

- `docs/discord.md`: the thin-reply paragraph (AUTONOMY-5/6) says a button
  ask that has expired is dropped rather than restated (the newest live ask
  is restated, or the reply runs the agent); the stored-ids sentence says a
  repeated option id gets the first unused number; the `/work` answer
  paragraph says a thin reply restates a button ask that has not expired.
- `specs/discord/discord.spec.md`: the ask prose names the expired-ask clear
  and the unique option ids. `specs/agent/agent.spec.md`: the ask-options
  line says ids come out unique.
- `specs/discord/testing.md` and `specs/agent/testing.md`: new sections for
  the tests.
- No README, STATUS, CHANGELOG, DISCORD-GO-LIVE or package version edits
  (nothing there describes these paths; release PRs own the rest).
