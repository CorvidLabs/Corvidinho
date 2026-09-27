---
change: discord-sessions-keep-their-thread-each-run-is-stored-with-its-session-and-a-continued-run-gets-the-earlier-turns
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-072` | `tests/discord.session-thread.test.ts` | Through `startBridge` with a fake gateway and a recording agent: "a reply that continues a session carries the earlier request and answer" (same session, `resume: true`, request + answer before the new message, `humanText` the new message only); "an @mention that continues the user's live session carries its thread too"; "every turn stays in the thread, oldest first, across several replies"; "the thread survives a bridge restart within the soft TTL" (file DB, second bridge); "a reply to a /session start answer carries its topic and answer" and the `/work` twin; "a button-pick resume carries the original request, not just the question and label" (and the next reply carries request, question, label, answer); "a spend-cap stop keeps the request in the thread but never its cap text"; "replayed turns are scrubbed of secrets, in the prompt and at rest". On origin/main fc0ed8d sources all 9 fail; on the branch all pass. |
| `REQ-discord-072` | `tests/discord.session-thread.unit.test.ts` | Renderer: no turns → no block; short thread whole and labelled; long thread ≤ budget with the opening request, one exact-count marker and the newest turns; one huge turn clipped; `answerTurnText` (button ask → question + choices, spend-cap → nothing). Store: table created on open without a `schema_meta.version` change (idempotent); turns reload after reopen per session; end and TTL expiry delete turns (memory + DB) and a late record on an ended session is a no-op; expired and orphan rows swept on reload; cap keeps the opening request and newest turns (memory = DB = reload); scrub on write, `SCRUB_TARGETS` entry, `rescrubDatabase` rewrites a raw row. Cannot load on origin/main (no `session-thread.ts`). |
| `REQ-discord-072` (guards: SESSION-3, SESSION-MULTI-1, SAFE-4) | `tests/discord.session-thread.test.ts` | "a session idle past the soft TTL starts fresh with no replayed turns"; "another user's session never sees my turns, and mine never sees theirs"; "confirm tokens come only from the current message, never from replayed turns". Pass on origin/main and on the branch. |
| `REQ-discord-098` | `tests/discord.spend.test.ts`, `tests/discord.slash-pending-ask.test.ts` | Unchanged "a substantive reply carries no cap text" tests still pass (they failed on a first cut that replayed the cap answer; now a spend-cap stop records no answer turn). |
| `REQ-discord-002`, `REQ-discord-019`, `REQ-discord-046` | `tests/discord.slash-reply-continuity.test.ts`, `tests/discord.session-store.durable.test.ts`, `tests/discord.router.test.ts` | Unchanged; still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean.
