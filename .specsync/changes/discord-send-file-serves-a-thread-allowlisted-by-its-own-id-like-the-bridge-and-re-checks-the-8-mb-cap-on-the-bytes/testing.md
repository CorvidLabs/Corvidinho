---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: testing
---

# Testing

Regression tests in `tests/discord.send-file.test.ts` (now 26). Fixtures
only: stubbed `fetch`, injected requester checker, `spyOn` on `node:fs`
`statSync` (restored after the test), `startBridge` with a fake gateway. No
live Discord or network.

Fail-on-main proof (`origin/main` 5366fff `plugins/discord/send-file.ts`
swapped in with the branch's tests, then restored):

- On `main`: 2 fail, 24 pass — "a thread allowlisted by its own id attaches
  without its parent listed" (refused: `"<parent>" is not allowlisted`) and
  "the 8 MB cap holds for the bytes read" (the grown PNG was uploaded). The
  ask-button test passes there: it covers a path the bridge already wires
  but no test exercised.
- On the branch: 26 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "DISCORD-5 / REQ-discord-212: a thread allowlisted by its own id attaches without its parent listed" | Thread listed, parent not: the PNG is uploaded to the thread after the acting user's `attachFiles` check. Parent deny-listed: refused `"<parent>" is denied`. Thread deny-listed under an allowlisted parent: refused `"<thread>" is denied`. Neither listed: refused (not allowlisted). One check, one upload in all. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "the 8 MB cap holds for the bytes read" | An 8 MB + 1 PNG whose `statSync` reports its pre-growth size is refused with the upload-limit error naming `8388609 bytes`; no requester check, no upload. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "an ask-button pick in a thread resumes with the conversation's thread and its parent" | A button ask raised in a thread; the pick's run gets `replyChannelId` = thread and `replyParentChannelId` = parent. |
