---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: research
---

# Research

- Write path: every `pending_ask` write goes through `persistSession` →
  `serializePendingAsks` → `pendingAskBody` (`setPendingAsk`,
  `clearPendingAsk`, `touch`, `create`). Scrubbing in `pendingAskBody`
  covers the single-object and the array row.
- Free text in a stored ask: `question` and `options[].label` (both
  model-written). `reason` is an enum; `askId` is `newAskId()` (12 hex
  chars) or a legacy `legacy_<8 chars>`; `expiresAt` is a number;
  `stubMessageId` is a Discord snowflake; option `id` is sanitized to
  `[a-zA-Z0-9_-]` (≤32 chars) and is embedded in the pick button's
  custom_id (`cvask:pick:<askId>:<optionId>`), so it must not change.
- Load path: `parsePendingAsk` → `askFromUnknown` →
  `resolveAskOptions`, which re-normalizes stored labels (clip to 80); a
  redaction marker is a plain label, so a scrubbed ask still loads.
- Re-scrub: `rescrubDatabase` ran `scrubSecrets` over each listed text
  column. A text scrub of the JSON column can break it: the private-key rule
  (REQ-discord-066) runs to the end of the text when the END line is missing,
  eating the closing quote and brace (the loader then drops the ask). Hence a
  JSON-aware pass: parse, scrub string values except id keys, re-serialize.
- `ensureScrubbed` runs the re-scrub once per `SCRUB_RULES_VERSION`; DBs
  already at version 2 need a bump to 3 to re-scrub existing `pending_ask`
  rows. `SCHEMA_VERSION` is untouched.
- Existing test assertions on `SCRUB_TARGETS` use `toContainEqual` for other
  tables only; `ensureScrubbed`'s return shape is unchanged
  (`rescrubDatabase` gains `jsonUnparsed`).
- Issues: #66 (SAFE-6 captured slice) is closed; no open issue tracks SAFE-6
  (GitHub issue search).
