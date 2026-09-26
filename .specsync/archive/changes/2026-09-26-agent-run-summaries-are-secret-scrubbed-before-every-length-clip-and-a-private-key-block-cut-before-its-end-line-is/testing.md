---
change: agent-run-summaries-are-secret-scrubbed-before-every-length-clip-and-a-private-key-block-cut-before-its-end-line-is
artifact: testing
---

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
