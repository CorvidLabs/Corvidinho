# Lesson bundle — discord-send-file-serves-a-thread-allowlisted-by-its-own-id-like-the-bridge-and-re-checks-the-8-mb-cap-on-the-bytes

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord-send-file serves a thread allowlisted by its own id like the bridge and re-checks the 8 MB cap on the bytes read (DISCORD-17 review follow-up)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: plugins/discord/send-file.ts, tests/discord.send-file.test.ts, docs/discord.md, docs/DISCORD-GO-LIVE.md, specs/discord/discord.spec.md, specs/discord/testing.md
- **Acceptance**: discord-send-file attaches in a thread allowlisted by its own id whose parent is not listed, as the router serves it (REQ-discord-212), and still refuses a deny-listed thread under an allowlisted parent and an allowlisted thread under a deny-listed parent (deny wins); a file whose stat was under 8 MB but whose bytes read are over it is refused with nothing checked or uploaded; an ask-button pick in a thread resumes with the thread as reply channel and its parent; DISCORD-GO-LIVE step 4 lists the bot's Attach Files permission

## Evidence

- Verification commit: `53f2e5df126fb01632b641ba57f51997aea8660e`
- Base commit: `5366fff96501327ad3bcc30f55105f2c16884b0b`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Review follow-up to PR #270 (issue #76, DISCORD-17 `discord-send-file`),
which was squash-merged before its adversarial review ran. The review's
major finding (the plugin gated the conversation channel on the allowlist
file / `CORVIDINHO_DISCORD_ALLOW_*` only, not `DISCORD_CHANNEL_IDS`) already
landed on `main` in #272 (c831898, `mergeChannelIds`), and #276 made a
deny-listed thread refused under an allowlisted parent. This change carries
only the review's remaining minors, re-derived against current `main`:

- A thread allowlisted by its own id, its parent not listed, is served by the
  chat router (`isMonitoredConversation`, REQ-discord-212), so the model is
  offered `discord-send-file` there, but the plugin checked only the parent
  and refused every attach ("not allowlisted").
- The 8 MB cap was checked on `statSync(...).size` only; a file that grew
  between the stat and the read was uploaded whole (an image has no later
  size check; text is re-checked after scrubbing).
- The read itself: `statSync` then `readFileSync(real)` read the whole file
  into memory before any re-check, and followed links at read time, so a
  file (or a folder on its path) swapped for a link after the SAFE-2 path
  checks was read and sent (for example a link to `.env`).
- The ask-button path's reply channel (thread + parent) was wired but had
  no test.
- The go-live bot invite did not list **Attach Files**, which uploads need.

Constraints: no new env var, flag, config key, table or command; deny still
wins (#276); no HI capture (DISCORD-17 is already in `hi/discord.md`).
Out of scope, pending Leif: refusing secret-named files (`secrets.json`,
`client_secret*`, `token.json`), EXIF stripping, replying to the human's
message, `--git-diff` covering untracked / committed changes, blanking
`CORVIDINHO_DISCORD_REPLY_*` in WATCH spawns (REQ-watch-008 is being changed
by #67).

## From the change's design.md

# Design

- `send-file.ts` gets an internal `conversationChannelRefusal(channel,
  parent, allowlist, env)`: it builds the bridge's gate config
  (`mergeChannelIds`, as #272) and asks `isMonitoredConversation` — the
  router's own function — so the plugin and the router cannot drift. On a
  refusal it returns the `checkChannel` error for the deny-listed id (thread
  first, then parent), else for `parent || channel` ("not allowlisted"), so
  the existing error texts are kept. Not exported: no Public API change.
- `fileAttachment` reads through an internal `readCheckedFile(root, real,
  raw)`: one `openSync(real, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)` (`real` is
  already resolved, so a link there was swapped in: `ELOOP` refuses, SAFE-2);
  `fstatSync` must show a regular file; the descriptor's own path
  (`readlinkSync("/proc/self/fd/<fd>")`, Linux; a trailing " (deleted)" is
  judged both ways) must still be inside the project and pass `refusedPath`,
  which catches a folder on the path swapped for a link; the fstat size is
  capped, then at most `DISCORD_UPLOAD_MAX_BYTES + 1` bytes are read in
  chunks, so a file that grew after the fstat is refused with `tooLarge`
  (exit 2) without being read whole. The descriptor is always closed. The
  type sniff / scrub run on those bytes, as before.
- Not changed: `discord-post-message` (model-chosen channel, its own gate);
  WATCH spawns still inherit `CORVIDINHO_DISCORD_REPLY_*` (REQ-watch-008,
  #67; a WATCH run cannot attach anyway: no acting user, ROLES-CHAT-3).
- Leftover risk: a hard link to `.env` placed inside the project under an
  innocent name is not detectable by path (same inode, no symlink to
  follow); SAFE-6 scrubbing of text still applies.

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
