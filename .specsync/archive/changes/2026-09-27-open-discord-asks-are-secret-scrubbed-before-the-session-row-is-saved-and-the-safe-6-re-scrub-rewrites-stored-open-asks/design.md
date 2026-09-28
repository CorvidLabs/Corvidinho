---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: design
---

# Design

- Write: `pendingAskBody` scrubs `question`, each option `label` and each
  option `id` with `scrubSecrets`; askId, expiresAt and stubMessageId are
  copied as before. The in-memory ask is not changed (as with `topic`), so a live
  session posts exactly what it posted before; only what is saved is scrubbed.
- Ask ids: `normalizeAskOptions` (`src/agent/ask-options.ts`) replaces a
  model-chosen option id that looks like a secret (`scrubSecrets` would change
  it) with its position, the same fallback an id with no usable characters
  already gets. Ids are capped at 32 chars of `[A-Za-z0-9_-]`, which still
  holds a whole AWS key id or 28 of a GitHub token's 36 characters. The
  button custom id and the stored row then agree, and every id an ask
  carries (askId: 12 hex, stubMessageId: a snowflake, option ids) is left
  alone by the scrub, so it stays byte-identical.
- Re-scrub: new `scrubJsonText(raw)` in `src/store/scrub.ts` parses one
  stored JSON document, scrubs every string value (key names are never
  touched), and re-serializes only when a value changed (unchanged rows stay
  byte-identical, so a second pass is a no-op). Text that does not parse is
  scrubbed as text (`parsed: false`). An older row's secret-looking option id
  is redacted like any other text (that one button stops matching; SAFE-6
  wins over a 30-minute button).
- `SCRUB_TARGETS` entries gain optional `json: [column]`; `discord_sessions`
  lists `pending_ask`. `rescrubDatabase` selects the JSON columns too,
  rewrites them via `scrubJsonText`, counts values that did not parse
  (`jsonUnparsed`) and, after the transaction, logs one
  `[scrub] <table>.<column>: N stored value(s) were not valid JSON; scrubbed as text`
  line per column — counts only, never the text.
- `SCRUB_RULES_VERSION` 2 → 3 so existing DBs re-scrub once on next open.
  No schema version bump, no new table/column/env/config/CLI/slash surface.

Alternatives considered: a text scrub over the JSON column (rejected: can
break the JSON and drop the open ask); scrubbing only `question` / `label`
by name in the re-scrub (rejected: an older row with another text field would
keep it raw — scrubbing every string covers "any other free text"); exempting
id keys from the scrub (rejected in review: a model-chosen option id can hold
a whole AWS key id or most of a GitHub token, and SAFE-6 names no exemption);
putting the JSON walker in the discord module (rejected: `rescrubDatabase`
lives in the store layer and must not import discord code).

Design choices pending Leif:
- A stored value that is not valid JSON is scrubbed as text (it cannot be read
  as an ask anyway, so the text scrub cannot break it), kept, counted and
  logged by count only — not deleted and not left raw.
- A secret-looking model-chosen option id becomes its position when the ask
  is made (it is never a secret the button needs); ids are otherwise never
  changed, because the scrub leaves a non-secret id alone.
- The in-memory ask stays as the model wrote it until the session reloads;
  outbound option labels are not scrubbed here (draft SAFE-10).
