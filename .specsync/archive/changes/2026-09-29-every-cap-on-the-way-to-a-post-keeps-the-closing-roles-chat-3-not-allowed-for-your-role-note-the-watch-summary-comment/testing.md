---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: testing
---

# Testing

One regression test per surface, each in the surface's existing test file;
no live Discord, GitHub or network. The inputs are the real
`chatBodyFromTaskResult` output of a summary ending with the note (1800 chars
for the Discord surfaces, 1529 for WATCH).

- Before the fix (`origin/main` 0f2e2c2's `src/discord/ask-ping.ts`,
  `src/discord/command-handlers/work.ts`, `session.ts`,
  `src/scheduler/service.ts` and `src/watch/summary.ts` swapped in): the five
  new tests fail, the other 50 tests in those four files pass.
- After the fix: all pass; `bunx tsc --noEmit` clean; full `bun test` and
  `fledge lanes run verify --non-interactive` green.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-734` | `tests/scheduler.service.test.ts` › "a long summary ending with the note keeps it in the run row and the post; one without is cut as before" | Run row summary is 1500 chars ending with the note; the post under a 448-char schedule name is ≤ 1900 and ends with the note; a plain 1800-char summary is stored and posted as its first 1500 chars. |
| `REQ-discord-734` | `tests/discord.slash-ask7.test.ts` › "/work answer for a non-owner keeps the closing role note within the 1900 cap" | Non-owner `/work` (owner-only PR line, 207-char description): collapsed answer ≤ 1900, summary part < 1500 (fitted after the head), ends with the note. |
| `REQ-discord-734` | `tests/discord.slash-ask7.test.ts` › "/session start answer for a non-owner keeps the closing role note within the 1900 cap" | Answer ≤ 1900, summary part ≤ 1500, ends with the note. |
| `REQ-discord-734` | `tests/discord.spend.test.ts` › "the cut for the warning line keeps a closing role note" | `withSpendWarningPost` on an 1800-char body with the note: 1900 chars ending `y…`, the note, blank line, owner-pinging 80% line; a fitting body is untouched; the no-note cut test still ends `…\n\nLINE`. |
| `REQ-watch-734` | `tests/watch.summary-scrub.test.ts` › "a long summary is clipped before its note, after the scrub; one without a note is clipped as before" | 1200-char preview ending with the note before the `---` footer; a token where the note makes room leaves no `ghp_`; a plain 1500-char summary keeps its first 1200 chars. |
