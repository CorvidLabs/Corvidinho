---
change: discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes
artifact: testing
---

# Testing

Regression tests in `tests/discord.send-file.test.ts` (now 27). Fixtures
only: stubbed `fetch`, injected requester checker, `spyOn` on `node:fs`
(`statSync` / `fstatSync` to report a stale size, `readFileSync` /
`readSync` to count the bytes read, `statSync` / `openSync` to swap the file
at its first stat or open; all restored after each test), `startBridge` with
a fake gateway. No live Discord or network.

Fail-before-fix proof (the branch's tests with another
`plugins/discord/send-file.ts` swapped in, then restored):

- `origin/main` 5366fff: 3 fail, 24 pass — "a thread allowlisted by its own
  id attaches without its parent listed" (refused: `"<parent>" is not
  allowlisted`), "the 8 MB cap holds for the bytes read" (the grown PNG was
  uploaded) and "a file swapped after the path checks" (`notes.txt`, swapped
  for a link to `.env`, was uploaded). The ask-button test passes there: it
  covers a path the bridge already wires but no test exercised.
- The first cut of this branch (cap re-checked after `readFileSync`): 2
  fail — the grown file was refused only after reading all 16 MB, and the
  swapped `notes.txt` was uploaded.
- With the `/proc/self/fd` re-check disabled, the folder swap
  (`logs/out.log` with `logs` swapped for a link into `.ssh`) is uploaded;
  with it, the test passes.
- The branch: 27 pass, 0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "DISCORD-5 / REQ-discord-212: a thread allowlisted by its own id attaches without its parent listed" | Thread listed, parent not: the PNG is uploaded to the thread after the acting user's `attachFiles` check. Parent deny-listed: refused `"<parent>" is denied`. Thread deny-listed under an allowlisted parent: refused `"<thread>" is denied`. Neither listed: refused (not allowlisted). One check, one upload in all. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "the 8 MB cap holds for the bytes read" | A 16 MB PNG whose size as first taken (`statSync` / first `fstatSync`) is its pre-growth size is refused with the upload-limit error naming `16777216 bytes` after more than 8 MB and at most 8 MB + 1 byte was read; no requester check, no upload. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "SAFE-2: a file swapped after the path checks" | `notes.txt` swapped for a link to `.env` is refused ("became a symlink after it was checked"); `logs/out.log` with `logs` swapped for a link into `.ssh` is refused ("now opens a protected, secret or outside path"); no requester check, no upload. |
| `REQ-discord-476` | `tests/discord.send-file.test.ts` › "an ask-button pick in a thread resumes with the conversation's thread and its parent" | A button ask raised in a thread; the pick's run gets `replyChannelId` = thread and `replyParentChannelId` = parent. |
