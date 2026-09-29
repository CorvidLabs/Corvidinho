---
module: watch
change: every-cap-on-the-way-to-a-post-keeps-the-closing-roles-chat-3-not-allowed-for-your-role-note-the-watch-summary-comment
---

# Delta: watch (run-summary comment keeps the closing role note, ROLES-CHAT-3)

## Added

### REQUIREMENT REQ-watch-734

The WATCH run-summary comment (REQ-watch-009) SHALL keep a summary's closing
ROLES-CHAT-3 note `\n\n(not allowed for your role)` (REQ-agent-333; WATCH
runs are non-ADMIN role sessions, REQ-watch-008) when it clips the summary to
its 1200-char cap: `buildSummaryBody` SHALL clip with `clipKeepingRoleNote`
(`src/agent/task-summary.ts`), so the text before the note loses its end and
the note stays last, right before the `---` attribution footer. The SAFE-6
scrub SHALL still run before the clip (REQ-watch-231). A summary that does not
end with the note SHALL be clipped exactly as before. No env var, config key
or flag.

Acceptance Criteria
- `tests/watch.summary-scrub.test.ts` "a long summary is clipped before its note, after the scrub; one without a note is clipped as before": a 1529-char summary ending with the note gives a 1200-char preview ending with the note before the footer; a token where the note makes room leaves no `ghp_` prefix; a 1500-char summary without the note keeps its first 1200 chars.
- With main's `src/watch/summary.ts` the test fails; it passes on the branch.
