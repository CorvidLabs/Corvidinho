# Lesson bundle — open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Open Discord asks are secret-scrubbed before the session row is saved and the SAFE-6 re-scrub rewrites stored open asks as JSON (SAFE-6)
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/agent/ask-options.ts, src/discord/session-store.ts, src/store/scrub.ts, tests/store.scrub.test.ts, docs/discord.md
- **Acceptance**: A button ask or free-text ask whose question or option label holds a vendor-key-shaped secret is stored in discord_sessions.pending_ask with [redacted:<kind>] in place of the secret, for both the single-object and the JSON-array row, and the session reloads with the same askId, option ids, expiresAt and stubMessageId (SAFE-6); when the scrub rules version rises, the next DB open re-scrubs raw pending_ask rows written by an older build by parsing the JSON, scrubbing its text values and re-serializing it (askId, expiresAt, option ids and stubMessageId byte-identical), the rewritten row stays valid JSON and loads as a pending ask even when a question holds a private-key block with no END line, a second open is a no-op, and a row that is not JSON is scrubbed as text and counted and logged without its content (SAFE-6 re-scrub); SCRUB_RULES_VERSION rises to 3; no SQLite schema version bump, no new table, column, env var, config key, CLI or slash command; regression tests fail on main and pass on the branch

## Evidence

- Verification commit: `55e4796c6508f4c62e909f42fa8f1a029c7c6d90`
- Base commit: `606b993d7175c2f32759e3f02865492e5e884389`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

HI (captured, `hi/safe.md`): **SAFE-6** — "Secrets that look like vendor
keys are scrubbed before sessions are saved, and I can re-scrub history when
rules tighten." Requirement: REQ-discord-066 ("Sessions, work tasks,
schedules, schedule runs and memories persist scrubbed"; "Rows written before
the current rules are re-scrubbed on next open; second open is a no-op").

Gap on main (606b993): a session's open asks are saved raw.
`discord_sessions.pending_ask` holds the model-written ask question and
option labels as JSON (one object, or an array when several asks are open
since #254). `pendingAskBody` / `serializePendingAsks` in
`src/discord/session-store.ts` copied them unscrubbed, while
`persistSession` scrubbed only `topic`; `SCRUB_TARGETS` listed only
`discord_sessions.topic`, so `rescrubDatabase` never rewrote the column.
Repro on main: `setPendingAsk` with question `use ghp_<36>?` and option
label `yes ghp_<36>` stored both tokens verbatim, and `rescrubDatabase`
returned `discord_sessions: 0` with the token still present. Schedule asks
(`schedule_runs.ask_question`) and session turns were already scrubbed and
re-scrubbed, so `pending_ask` was the one session column left raw.

Constraints: no SQLite schema bump; no new CLI, slash command, env var or
config key; open buttons must keep working (askId, option ids, expiresAt and
stubMessageId byte-identical, which holds because no id an ask carries looks
like a secret once a secret-looking option id falls back to its position);
the re-scrub must not run a text scrub over
the JSON column (a private-key block with no END line runs to the end of the
text and would cut the closing quote and brace). Open PR #232 (ask-button
actor gate + mute/rate) and #233 (SAFE-3 clamp, busy-lock test timeouts) do
not touch `session-store.ts` or `scrub.ts`.

## From the change's design.md

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

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "question and option labels are scrubbed in the one-object and the array row; ids reload unchanged" | Button ask (fake `ghp_` in the question, fake `sk-ant-` in a label) stored as one object with `[redacted:github-token]` / `[redacted:anthropic-key]`, askId, expiresAt, option ids and stubMessageId unchanged; a free-text ask (fake `sk-proj-`) turns the row into an array, both scrubbed; after a reopen `pendingAsk` / `openAsks` keep askId, expiresAt, stubMessageId and option ids and `findPendingAsk` finds the earlier ask. Fails on main (tokens stored raw). |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "raw rows from an older build are rewritten as valid JSON on next open, ids byte-identical; second open is a no-op" | Raw object row (private-key block with no END line in the question, fake Slack token in a label) and raw array row saved under rules version 2: next open rewrites both as valid JSON, ids byte-identical (`"askId":"ask1","expiresAt":…` in place), a clean row stays byte-identical, version recorded as 3, second open and a direct re-scrub change nothing, and the rows load as open asks with their ids. Fails on main (version 2 is current, column not re-scrubbed). |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "a secret-looking option id is swapped for its position when the ask is made, and scrubbed on write and on re-scrub" | ask-human options with a GitHub-token id and an AWS-key-id id get ids `1` / `2` (`keep` kept); the saved row carries neither; a `PendingAsk` built without `normalizeAskOptions` stores the id as `[redacted:aws-key]`; an older row's AWS-key-id option id is redacted on the next open with askId, expiresAt and stubMessageId byte-identical, and a clean row is unchanged. Fails on main and on the first branch head (ids kept raw by an id-key exemption); each of `ask-options.ts`, `session-store.ts` and `scrub.ts` reverted alone fails it. |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "a stored ask that is not JSON is scrubbed as text and counted; its content is never logged" | A cut-off JSON value is text-scrubbed, `jsonUnparsed` is 1, the warning names `discord_sessions.pending_ask: 1` and holds no stored text or token. Fails on main (value unchanged, no count). |

## Fail-on-main proof

Swapping main's `src/store/scrub.ts`, `src/discord/session-store.ts` and
`src/agent/ask-options.ts` in: the 4 new tests fail (13 others in the file
pass); restored branch source: 17/17 pass in the file.

## Automated coverage

- `bun test tests/store.scrub.test.ts`
- `bun test` (existing pending-ask, re-scrub, session-thread, spend, schedule outbox and busy-lock tests unchanged)
- `bunx tsc --noEmit`

## Where these lessons go

- `specs/discord/context.md`
