---
change: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
artifact: design
---

# Design

1. **Scrub before every clip in `task-summary.ts`.** Add a private
   `scrubClip(text, max)` = `scrubSecrets(text).trim().slice(0, max)` and use
   it for the result summary (1800), non-frame stdout (1800) and stderr (500).
   `--json` stdout is still parsed from the raw text, and only the extracted
   summary is scrubbed, so a scrub cannot break the JSON. Scrubbing only
   replaces matches with non-empty markers, so the `||` fallbacks still pick
   the same source.
2. **Scrub before the result frame cap.** `resultFrame` passes a summary within
   4000 chars through unchanged (the same TaskResult object, as with
   `--json`, REQ-cli-073). An over-long summary goes through the existing
   `capHead` (scrub, then clip + `…`). If the scrubbed text fits, it is sent
   without `truncated`.
3. **Redact an open private-key block.** The `private-key` pattern ends at the
   END line, else just before the next `-----BEGIN `, else at the end of the
   text:
   `/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:(?!-----BEGIN )[\s\S])*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|(?=-----BEGIN )|$)/g`.
   Full blocks are still redacted one by one. Public-key and certificate blocks
   do not match the header. Bump `SCRUB_RULES_VERSION` to 2 so stored rows are
   re-scrubbed once (REQ-discord-066).

The WATCH sink scrubs from REQ-watch-231 stay as they are (the scrub is
idempotent). There is no new public API, env var, command or schema change.
