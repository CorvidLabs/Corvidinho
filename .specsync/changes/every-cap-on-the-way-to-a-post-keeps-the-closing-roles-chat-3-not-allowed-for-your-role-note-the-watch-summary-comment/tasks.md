---
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
artifact: tasks
---

# Tasks

- [x] Regression tests: WATCH comment (`tests/watch.summary-scrub.test.ts`), schedule run row + post (`tests/scheduler.service.test.ts`), `/work` and `/session start` (`tests/discord.slash-ask7.test.ts`), SAFE-8 append (`tests/discord.spend.test.ts`); all five fail on `origin/main` 0f2e2c2, pass on the branch.
- [x] `ask-ping.ts`: `POST_SUMMARY_MAX`, `clipPostSummary`; `appendPostLine` keeps the note.
- [x] Scheduler run row + post, `/work` and `/session start` answers use `clipPostSummary` (fitted after the head).
- [x] WATCH `buildSummaryBody` clips with `clipKeepingRoleNote` after the scrub.
- [x] Spec Public API / Invariants / testing; deltas Added REQ-discord-734 and REQ-watch-734.
- [x] Docs: DISCORD-GO-LIVE.md, WATCH.md, discord.md.
- [x] SpecSync approve / check / audit, coverage, `hi check`, `tsc`, `bun test`, fledge verify.
