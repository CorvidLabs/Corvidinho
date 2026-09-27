---
change: slash-pending-ask-tests-expect-the-req-discord-215-collapsed-ping-to-the-clarify-requester-after-a-work-or-session
artifact: tasks
---

# Tasks

- [x] `runSlash` in tests/discord.slash-pending-ask.test.ts sets the
      collapsed ping (`↑ question for you`) aside into `bridge.pings`, so the
      reply counts cover only replies to the answer.
- [x] The thin-reply test asserts exactly one ping, `<@requester> ↑ question
      for you`, with allowed mentions limited to the requester.
