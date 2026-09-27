---
change: slash-pending-ask-tests-expect-the-req-discord-215-collapsed-ping-to-the-clarify-requester-after-a-work-or-session
artifact: context
---

# Context

#216 (REQ-discord-044) landed on main with tests that count every post the
bridge makes after a `/work` or `/session start` clarify answer. #220
(REQ-discord-215, AUTONOMY-4, DISCORD-ASK-6/7) makes a collapsed answer that
mentions the clarify requester send one fresh ping post, since an edit never
notifies a mention. Merging main into #220 made three #216 tests see that
ping as an extra reply. The ping is intended (REQ-discord-215 covers chat,
button pick and slash answers), so the tests change; source and specs do not.
