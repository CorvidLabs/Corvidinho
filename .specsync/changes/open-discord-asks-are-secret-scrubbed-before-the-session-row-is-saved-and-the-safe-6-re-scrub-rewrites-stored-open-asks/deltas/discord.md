---
module: discord
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
---

# Delta — discord (open asks scrubbed at rest and re-scrubbed as JSON, SAFE-6)

## Modified

### REQUIREMENT REQ-discord-066

Corvidinho SHALL redact vendor-key-looking secrets (GitHub, OpenAI-compatible,
Anthropic, Discord bot, Slack, AWS, Google, JWT, Bearer, PEM private keys) as
`[redacted:<kind>]` before any free text is written to the shared SQLite DB:
session topics, the session's open asks (question and option labels in
`discord_sessions.pending_ask`), work task descriptions/summaries, schedule
names/descriptions/prompts, schedule run summaries/errors, and memory
keys/content (SAFE-6).
Redaction SHALL be idempotent and leave ordinary text unchanged. Because
callers also scrub text written by others (PR diffs, REQ-plugins-093), every
scrub pattern SHALL run in time linear in its input.

A PEM private-key block SHALL be redacted even when its END line is missing
(text clipped mid-key, or a key pasted without its footer). From its
`-----BEGIN … PRIVATE KEY-----` header, the redaction SHALL run to the END
line, else to just before the next `-----BEGIN ` line, else to the end of the
text. Other PEM blocks (public keys, certificates) SHALL stay unchanged.

When the scrub rules tighten (`SCRUB_RULES_VERSION` increases), the next open
of the shared DB SHALL re-scrub existing rows once and record the version in
`schema_meta` (SAFE-6 re-scrub). Version 2 adds the open private-key block
rule. Version 3 adds the open asks: a stored `pending_ask` (one JSON object,
or an array when several asks are open) SHALL be parsed, its text values
scrubbed and the document re-serialized, so the row stays valid JSON (a text
scrub could cut it: a private-key block with no END line runs to the end of
the text). Every string value is scrubbed, ids included. A model-chosen option
id that looks like a secret SHALL be replaced by its position when the ask is
made, so the ids an ask carries (askId, option ids, stubMessageId) never look
like a secret and, with expiresAt, stay byte-identical on write and on
re-scrub, so open buttons keep working; an older row's secret-looking id is
redacted like any stored text. A stored value that does not parse SHALL be
scrubbed as text and counted; the log line SHALL name the column and the
count, never the stored text. No CLI
or slash surface is added. Outbound reply scrubbing beyond the
spawned-run summary text (REQ-agent-232) and a Discord-admin re-scrub command
are draft SAFE-10 and out of scope until captured.

Acceptance Criteria
- Each vendor shape is redacted; ordinary text is untouched; scrub is idempotent.
- Hostile input (many private-key or JWT openers with no closer) scrubs in linear time.
- A private-key block with no END line is redacted through the next BEGIN line or the end of the text; full blocks are still redacted one by one; public-key and certificate blocks are unchanged.
- Sessions, work tasks, schedules, schedule runs and memories persist scrubbed.
- Rows written before the current rules are re-scrubbed on next open; second open is a no-op.
- A button ask and a free-text ask whose question or option label holds a fake vendor key are stored in `discord_sessions.pending_ask` as `[redacted:<kind>]`, in the one-object and the array row; the session reloads with the same askId, option ids, expiresAt and stubMessageId.
- A raw `pending_ask` row (one object or an array) from an older build is rewritten on the next open after `SCRUB_RULES_VERSION` rises, stays valid JSON with its ids byte-identical even when a question holds a private-key block with no END line, and still loads as the session's open asks; a second open is a no-op.
- A `pending_ask` value that is not JSON is scrubbed as text and counted (`jsonUnparsed`); the warning names the column and count, never the stored text.
- A model-chosen option id that looks like a secret is replaced by its position when the ask is made, so neither the button nor the stored row carries it; an id that reaches the row another way is stored redacted, and an older row's secret-looking option id is redacted by the re-scrub while its other ids stay byte-identical.
- Fixture tests use runtime-built fake secrets only.
