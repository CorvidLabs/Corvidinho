---
module: discord
change: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
---

# Delta — discord (footer-only embed on the collapsed final answer)

## Added

### REQUIREMENT REQ-discord-457

When the bridge edits the thinking progress message into the final answer
(DISCORD-ASK-7: an @mention or reply, the answer to a run a button pick
resumed, `/session start`, `/work`), the edit SHALL keep one footer-only embed
(no description) whose footer text is the LLM model and the run's plumbing
(`state=… verified=… [verifySkipped] [cancelled] attempts=…`) joined by
` | `, so both stay visible without entering the answer body (DISCORD-3.a).
The embed SHALL be colored like the done or error status the fallback would
show. A Choose stub (the edit that carries buttons) SHALL carry no embed
(DISCORD-ASK-6, REQ-discord-047). The answer body SHALL remain human text only.

Acceptance Criteria
- Mention answer collapsed into the thinking message: `content` is the summary and `embed` is `{ color, footer: { text: "<model> | state=… verified=… [verifySkipped] attempts=…" } }` with no description; no `✅ Done` embed edit.
- Button pick: the Choose stub edit has `embed: null`; the answer of the run the pick resumed, edited into that stub, carries the footer-only embed.
- `/session start` and `/work` collapsed answers carry the same footer-only embed; the body never contains `state=` or `attempts=`.
- Color: success unless the fallback would mark the status failed (a failed run without a question, or a stuck ask), then error.
- A later re-edit of the collapsed answer (SAFE-8 owner notice appended) keeps the same footer and color.
- With neither a model nor plumbing known the answer carries no embed; the fallback without `editMessage` is unchanged (done/error embed with the plumbing + separate reply).
- No new env vars, config keys, slash commands or schema changes.
