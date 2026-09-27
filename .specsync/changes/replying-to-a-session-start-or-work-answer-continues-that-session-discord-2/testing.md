---
change: replying-to-a-session-start-or-work-answer-continues-that-session-discord-2
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-002` | `tests/discord.slash-reply-continuity.test.ts` | Through `startBridge` with a fake gateway and a recording agent: `/session start` A then B, and `/work` A then B, then the owner replies to A's collapsed answer with the ping on and with it off: the third agent run is session A with `resume: true` (4 tests). "fallback answer (no collapse) is tracked too": with no `editMessage`, the answer lands in the deferred reply (`editReply` returns its id) and a reply to it resumes A. On origin/main 6e5370d, and again on 3cdbb5c after merging main, all 5 fail (ping on → session B; ping off and fallback → no run); after the fix all pass. Reverting only `slash-finish.ts` fails the fallback test alone. |
| `REQ-discord-046` | `tests/discord.slash-reply-continuity.test.ts` | "another user replying to the owner's /session start answer cannot hijack it": ping off → no run; ping on → a new session owned by the other user (`resume: false`), session A still owned by the owner. Passes before and after (guard). |
| `REQ-discord-048` | `tests/discord.slash-ask7.test.ts`, `tests/discord.spend.test.ts` | ASK-7 collapse / fallback and SAFE-8 slash owner-notice tests unchanged and still pass. |

Full suite: `bun test` green; `bunx tsc --noEmit` clean.
