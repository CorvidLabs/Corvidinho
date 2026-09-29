---
change: free-text-asks-post-a-short-public-stub-with-the-question-and-one-answer-button-that-opens-a-private-form-its-submit
artifact: docs
---

# Docs

- `docs/discord.md` "Questions and owner ping": free-text asks carry the
  Answer button and private form, its gates, expiry, scrubbing, reply
  fallback, schedule asks unchanged; the hint text; `/work` / `/session start`
  answers; the thin-reply restatement; the session-thread paragraph names the
  form's answer; the deny table row covers the Answer button and its form.
- `specs/discord/discord.spec.md`: new paragraph (REQ-discord-548), the
  `keepFooter` note, `ASK_ANSWER_HINT` export, a behavioral scenario, and
  `tests/discord.ask-answer-modal.test.ts` in `files:`;
  `specs/discord/testing.md`: new section. Requirements through the delta.
- README, STATUS.md and DISCORD-GO-LIVE.md say nothing this makes false
  (modals need no new intent or permission). No CHANGELOG / version edits.
