# Lesson bundle — agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Agent run summaries are secret-scrubbed before every length clip, and a private-key block cut before its END line is redacted
- **Kind**: BugFix
- **Specs**: agent, discord
- **Paths**: src/agent/task-summary.ts, src/agent/events-ndjson.ts, src/store/scrub.ts, tests/agent.summary-scrub.test.ts, tests/store.scrub.test.ts, tests/watch.summary-scrub.test.ts
- **Acceptance**: a run summary whose stderr fallback, non-frame stdout or result summary holds a vendor token or PEM private key that straddles a length cap (500-char stderr fallback, 1800-char chat body, 4000-char result frame) comes out as [redacted:<kind>] with no raw token prefix or key body, so WATCH and Discord never post it; scrubSecrets redacts a BEGIN ... PRIVATE KEY block that has no END line through the next BEGIN line or end of text while still redacting full blocks in linear time; text with no secret is unchanged

## Evidence

- Verification commit: `0f9090a2ea88a09e0bcb120ac078ba7e5f9bd65d`
- Base commit: `5b0c8a64a53421a13f292eed646b2358f4545c72`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

PR #190 (REQ-watch-231) made WATCH scrub the run summary before its own clips
(1200-char thread comment, 240-char spawn-log preview). A blocker review then
found that the text WATCH receives has already been clipped once, unscrubbed,
by the shared run-summary helpers:

- `chatBodyFromTaskRunOutput` / `summarizeTaskRunOutput` clip the stderr
  fallback to 500 chars and non-frame stdout to 1800 chars.
- `chatBodyFromTaskResult` clips the result summary to 1800 chars.
- The child's `resultFrame` caps the summary at 4000 chars before it is sent.

A clip can cut a secret into a shape `scrubSecrets` no longer matches. A
`ghp_` token starting at stderr char 477 reached the public WATCH comment as
`ghp_` plus 19 chars (the pattern needs 20). A PEM private key that starts
before 1800 and ends after it loses its END line, and the private-key pattern
needed the END line, so the header and about 1.1k chars of key body were
posted. Discord replies and delegate summaries go through the same helpers, so
the same holes applied there (Discord replies are public too, SAFE-6).

Constraints: bug fix only. No new env var, command, table or column. Reuse
`scrubSecrets`. Text with no secret must come out exactly as before.
REQ-discord-066 notes that broader outbound reply scrubbing is draft SAFE-10;
this change only covers the spawned-run summary text these helpers produce.

## From the change's design.md

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

## From the change's testing.md

# Testing

All fixtures build fake secrets at runtime (`"gh" + "p_" + …`, a fake PEM of
26 base64-looking lines, about 1.7k chars like an RSA-2048 key). There is no
network and no live token. The WATCH tests drive `startWatchPoller` in dry-run
mode with a sh fake of the corvidinho bin, an echo ack client and a temp-file
`SpawnOutcomeStore`.

On the current branch code all 8 new or changed tests fail. After the fix they
pass. Reverting one source file at a time fails that file's own tests:
`task-summary.ts` 5, `events-ndjson.ts` 1, `scrub.ts` 2. The full
`bun test` suite stays green, including the existing NDJSON, spawn, pr-diff
hostile-input and re-scrub tests.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-232` | `tests/agent.summary-scrub.test.ts` › a token straddling char 500 of stderr is redacted, not clipped to a ghp_ prefix | The token starts at stderr index 477. `chatBodyFromTaskRunOutput`, `summarizeTaskRunOutput` and the JSON-without-summary path return `e…e [redacted:github-token]` with no `ghp_`. Token-free stderr is still trimmed and clipped to 500, and empty output gives `(exit N)`. |
| `REQ-agent-232` | `tests/agent.summary-scrub.test.ts` › non-frame stdout: a token straddling char 1800 is redacted before the clip | The token starts at stdout index 1777. Both helpers return the redacted text. Token-free stdout is clipped to 1800 as before. |
| `REQ-agent-232` | `tests/agent.summary-scrub.test.ts` › a PEM key straddling char 1800 of the result summary leaves no header or key body | The key starts at 1000 and its END is past 1800. `chatBodyFromTaskResult`, `summarizeTaskResult` and both `--json` stdout helpers hold `[redacted:private-key]` and no header or key line. A token at 1777 is redacted. Token-free summaries are unchanged. |
| `REQ-agent-232` | `tests/agent.summary-scrub.test.ts` › a PEM key straddling the child's 4000-char cap is redacted in the frame | The key starts at 3000 and ends past 4000. The `resultFrame` summary holds `[redacted:private-key]` and the text after the key. A token at 3977 is not shipped as a `ghp_` prefix. A small summary returns the same TaskResult object, and a token-free over-cap summary is still `head(4000) + …` with `truncated: true`. |
| `REQ-agent-232` / `REQ-watch-231` | `tests/watch.summary-scrub.test.ts` › a token straddling the 500-char stderr fallback cap leaks no prefix into the comment | A fake bin writes 476 chars and then the token to stderr and exits 1. The posted `Failed (exit 1)` comment holds `[redacted:github-token]`, and neither the comment nor the JSONL line holds `ghp_`. |
| `REQ-agent-232` / `REQ-watch-231` | `tests/watch.summary-scrub.test.ts` › a PEM key cut by the 1800-char chat body cap posts no key body | A result frame whose key starts at 100 and ends past 1800. The comment and the JSONL preview hold `[redacted:private-key]` and no header or key body. |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › a private-key block cut before its END line is redacted | An open block is redacted through the end of the text, and to the next BEGIN line when another block follows. A following full key is redacted on its own, a following certificate is kept, full blocks keep the text between them, and the scrub is idempotent. Public-key and certificate blocks and plain text are unchanged. |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › runs in linear time on hostile input (many openers, no closer) | JWT openers are still unchanged and fast. The 20k private-key openers with no closer, 20k non-matching END lines, and a 200k-char END label run are each redacted in under 1s. |
| `REQ-discord-066` (re-scrub, unchanged) | `tests/store.scrub.test.ts` › rows written raw are scrubbed on next open; version recorded once | `SCRUB_RULES_VERSION` is now 2. The re-scrub-on-open test still passes against the new version. |
| `REQ-cli-073` / `REQ-agent-073` / `REQ-discord-073` (unchanged) | `tests/agent.events-ndjson.test.ts`, `tests/agent.ndjson-spawn.test.ts`, `tests/spawn.argv.test.ts` | The existing frame, spawn and fallback tests pass unchanged, so token-free frames and summaries are the same as before. |

## Where these lessons go

- `specs/agent/context.md`
- `specs/discord/context.md`
