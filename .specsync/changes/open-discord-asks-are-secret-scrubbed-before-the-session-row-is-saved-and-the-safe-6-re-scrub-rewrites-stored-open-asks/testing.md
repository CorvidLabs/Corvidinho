---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "question and option labels are scrubbed in the one-object and the array row; ids reload unchanged" | Button ask (fake `ghp_` in the question, fake `sk-ant-` in a label) stored as one object with `[redacted:github-token]` / `[redacted:anthropic-key]`, askId, expiresAt, option ids and stubMessageId unchanged; a free-text ask (fake `sk-proj-`) turns the row into an array, both scrubbed; after a reopen `pendingAsk` / `openAsks` keep askId, expiresAt, stubMessageId and option ids and `findPendingAsk` finds the earlier ask. Fails on main (tokens stored raw). |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "raw rows from an older build are rewritten as valid JSON on next open, ids byte-identical; second open is a no-op" | Raw object row (private-key block with no END line in the question, fake Slack token in a label) and raw array row saved under rules version 2: next open rewrites both as valid JSON, ids byte-identical (`"askId":"ask1","expiresAt":…` in place), a clean row stays byte-identical, version recorded as 3, second open and a direct re-scrub change nothing, and the rows load as open asks with their ids. Fails on main (version 2 is current, column not re-scrubbed). |
| `REQ-discord-066` | `tests/store.scrub.test.ts` › "a stored ask that is not JSON is scrubbed as text and counted; its content is never logged" | A cut-off JSON value is text-scrubbed, `jsonUnparsed` is 1, the warning names `discord_sessions.pending_ask: 1` and holds no stored text or token. Fails on main (value unchanged, no count). |

## Fail-on-main proof

Swapping main's `src/store/scrub.ts` and `src/discord/session-store.ts` in:
the 3 new tests fail (13 others in the file pass); restored branch source:
16/16 pass in the file.

## Automated coverage

- `bun test tests/store.scrub.test.ts`
- `bun test` (existing pending-ask, re-scrub, session-thread, spend, schedule outbox and busy-lock tests unchanged)
- `bunx tsc --noEmit`
