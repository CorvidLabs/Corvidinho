---
change: stop-button-test-a-non-owner-s-thrown-run-shows-discord-3-b-s-failure-line-not-the-raw-error
artifact: context
---

# Context

Merging main into `claude/m2-failed-reply-reason` (PR #340, DISCORD-3.b) brought in
main's AGENT-3.a Stop-button test (#337). Its case "a failed run's answer clears the
button too, and so does the failure status when the run throws" asserted that Alice's
failure status reads the thrown error verbatim (`❌ spawn failed`). With DISCORD-3.b,
only the owner sees a failed run's reason; Alice is not the owner and the test harness
sends no owner DM, so her status reads `❌ That didn't work.` (`FAILED_TEXT`).

The test now expects `❌ ${FAILED_TEXT}` and keeps every Stop-button assertion
(REQ-discord-303: the button clears on a failed answer and on a thrown run). Canonical
spec text is unchanged; DISCORD-3.b's own change (this PR) carries the behavior.
