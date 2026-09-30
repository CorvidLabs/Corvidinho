---
module: discord
change: ask-questions-and-choice-labels-are-secret-scrubbed-before-they-are-cut-or-posted-safe-6-a
---

# Delta: discord (ask questions and choice labels scrubbed before they are cut or posted — SAFE-6.a)

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

An ask's question and each of its choice labels SHALL be scrubbed before
they are cut or posted (SAFE-6.a): the question before its `ASK_QUESTION_MAX`
(1500) cut (`normalizeQuestion`, which every ask the tool loop makes, the
spawn client reads from a result frame and a stored ask reloads through), and
each label before its 80-character cut (`cleanAskLabel`, which every option
`resolveAskOptions` returns goes through, and again every Choose-pick button
label `buildChoiceComponents` posts). A question or label that held a secret
SHALL show `[redacted:<kind>]` (a marker the cut itself falls inside is cut
like other text), so a secret the cut would split never survives as a raw
piece shorter than its scrub pattern's minimum, in what is posted (the
Choose-pick buttons, the Answer stub and its form, an ask restated after a
restart, a schedule ask post) and in what is stored
(`discord_sessions.pending_ask`, `schedule_runs.ask_question`). Option ids
keep the behaviour above. No env var, config key, flag, command, data field,
schema or `SCRUB_RULES_VERSION` change.

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
- A fake vendor key written raw, before the current rules, into any one of the listed text columns — session topic, work task description and summary, schedule name, description and prompt, schedule run summary and error, memory key and content — reads `[redacted:<kind>]` after the next open that re-scrubs; `SCRUB_TARGETS` lists each of these columns.
- A choice label whose fake key starts where the whole marker fits before the 80-character cut is `…[redacted:github-token]…` on the Choose-pick buttons, in the stored `pending_ask` row and in the resumed pick's human text, with ids `1` / `2` unchanged; after a restart the reloaded ask posts the same labels, and a stored label past the cut with the key across it loads scrubbed before it is cut (its id unchanged).
- A free-text question whose fake key straddles the 1500-character cut is stored as `…[redacted:github-token]…`; nothing the Answer stub, its form or a restated ask posts carries a raw piece of the key.
- A schedule run's question whose fake key straddles the cut is stored in `schedule_runs.ask_question` as `…[redacted:github-token]…` for a daemon-claimed and a bridge-claimed run; neither the run summary nor the posts carry a raw piece.
- `buildChoiceComponents` posts a label that holds a whole or a straddling key as `[redacted:<kind>]`, at most 80 characters, with custom_ids unchanged.
- These tests fail on the base sources and pass on the branch.
