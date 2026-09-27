---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: design
---

# Design

- Write: `pendingAskBody` scrubs `question` and each option `label` with
  `scrubSecrets`; askId, expiresAt, option ids and stubMessageId are copied
  as before. The in-memory ask is not changed (as with `topic`), so a live
  session posts exactly what it posted before; only what is saved is scrubbed.
- Re-scrub: new `scrubJsonText(raw, keepKeys)` in `src/store/scrub.ts`
  parses one stored JSON document, scrubs every string value except the values
  under `keepKeys` (key names are never touched), and re-serializes only when
  a value changed (unchanged rows stay byte-identical, so a second pass is a
  no-op). Text that does not parse is scrubbed as text (`parsed: false`).
- `SCRUB_TARGETS` entries gain optional `json: { column: keepKeys }`;
  `discord_sessions` lists `pending_ask` with keep keys `askId`,
  `stubMessageId`, `id`. `rescrubDatabase` selects the JSON columns too,
  rewrites them via `scrubJsonText`, counts values that did not parse
  (`jsonUnparsed`) and, after the transaction, logs one
  `[scrub] <table>.<column>: N stored value(s) were not valid JSON; scrubbed as text`
  line per column — counts only, never the text.
- `SCRUB_RULES_VERSION` 2 → 3 so existing DBs re-scrub once on next open.
  No schema version bump, no new table/column/env/config/CLI/slash surface.

Alternatives considered: a text scrub over the JSON column (rejected: can
break the JSON and drop the open ask); scrubbing only `question` / `label`
by name in the re-scrub (rejected: an older row with another text field would
keep it raw — scrubbing every non-id string covers "any other free text");
putting the JSON walker in the discord module (rejected: `rescrubDatabase`
lives in the store layer and must not import discord code).

Design choices pending Leif:
- A stored value that is not valid JSON is scrubbed as text (it cannot be read
  as an ask anyway, so the text scrub cannot break it), kept, counted and
  logged by count only — not deleted and not left raw.
- Option ids, askId and stubMessageId are never scrubbed (they are ids in
  posted button custom_ids / the stub message); a model-chosen option id is
  already limited to `[a-zA-Z0-9_-]` and 32 chars.
- The in-memory ask stays as the model wrote it until the session reloads;
  outbound option labels are not scrubbed here (draft SAFE-10).
