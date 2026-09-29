---
module: discord
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
---

# Delta: discord (closing role note kept on the way to a post, ROLES-CHAT-3)

## Added

### REQUIREMENT REQ-discord-734

A run summary that ends with the ROLES-CHAT-3 closing note
`\n\n(not allowed for your role)` (REQ-agent-333) SHALL keep that note
through every cap it meets after `chatBodyFromTaskResult` on its way to a
Discord post. Each such cap SHALL use `clipKeepingRoleNote`
(`src/agent/task-summary.ts`): the text before the note loses its end and
the note stays last.

- A scheduled run's summary SHALL be capped at `POST_SUMMARY_MAX` (1500
  chars) for the run row's `summary` and for the `✅` / `❌` schedule post,
  and in the post also at what fits after the post's head within
  `ASK_REPLY_MAX` (1900), so the gateway's 1900 cut never reaches it.
- The `/work` and `/session start` answers SHALL cap the summary at 1500
  chars and at what fits after the answer's head (task, session, worktree,
  description and PR lines; session, topic and worktree lines) within 1900,
  so the gateway's 1900 cut never drops the note.
- `appendPostLine`, which cuts a post's body so the SAFE-8 80% warning line
  fits within 1900 (chat replies, schedule posts, a slash owner notice that
  rides the answer), SHALL cut the body before the note, end the kept text
  in `…`, and keep the note ahead of the warning line.

`ask-ping.ts` SHALL export `POST_SUMMARY_MAX` and
`clipPostSummary(summary, headLength = 0)` for these caps. A summary that
does not end with the note SHALL be capped exactly as before. An ask's post
(a question or Choose stub, including a stuck ask's 400-char context) is not
changed. No env var, config key, flag, slash command, table or schema change.

Acceptance Criteria
- `tests/scheduler.service.test.ts` "a long summary ending with the note keeps it in the run row and the post; one without is cut as before": the run row's summary is 1500 chars ending with the note; the post (448-char schedule name) is at most 1900 chars and ends with the note; a run without the note stores and posts exactly its first 1500 chars.
- `tests/discord.slash-ask7.test.ts` "/work answer for a non-owner keeps the closing role note within the 1900 cap": the collapsed answer is at most 1900 chars, its summary part is under 1500 (fitted after a long head) and it ends with the note.
- Same file, "/session start answer for a non-owner keeps the closing role note within the 1900 cap": at most 1900 chars, the summary part at most 1500, ending with the note.
- `tests/discord.spend.test.ts` "the cut for the warning line keeps a closing role note": an 1800-char body ending with the note plus the 80% line is a 1900-char post ending `y…`, the note, a blank line and the warning line; a body that fits is untouched; a long body without the note still ends `…\n\nLINE`.
- With main's `src/discord/ask-ping.ts`, `src/discord/command-handlers/work.ts`, `src/discord/command-handlers/session.ts` and `src/scheduler/service.ts`, these four tests fail; they pass on the branch.
