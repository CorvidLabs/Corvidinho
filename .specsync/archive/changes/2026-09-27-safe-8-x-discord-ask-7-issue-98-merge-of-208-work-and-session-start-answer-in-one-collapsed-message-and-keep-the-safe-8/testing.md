---
change: safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8
artifact: testing
---

# Testing

Fixtures only: fake gateway (posts can fail), a thinking outbound with a
recording `editMessage` (edits can fail), fake slash interactions with
`deleteReply`, in-memory SQLite. #208's `tests/discord.slash-ask7.test.ts`
passes unchanged.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-098` | `tests/discord.spend.test.ts` "/work at the cap: the thinking message becomes the paused ask …" | collapsed answer has `(blocked)`, the spend-cap ask, no ✅ and no mention; deferred reply deleted, no editReply; one fresh owner post with the warning; none on the second `/work`. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "/session start with a stuck ask …" | stuck: collapsed ask (no ✅) + fresh owner post; clarify: collapsed answer mentions only the requester, no owner post. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "the fresh owner post fails …" | the collapsed message is edited again with the notice appended and the owner in its allowed mentions. Fails without the re-edit. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "nothing carried the notice …" | collapse, reply (throws) and owner post fail: `onSlash` rejects, and the next chat answer carries the owner ping and the warning. Fails without `notice.release()`. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` "/work at the cap: blocked task, paused status …" (fallback, no `editMessage`) | status embed shows `SPEND_CAP_STATUS`, not an error, not ✅ Done. Fails without `askStatus`. |
| `REQ-discord-098` | `tests/discord.spend.test.ts` existing slash / notice cases (expired token, both fail, `finishSlashWithOwnerNotice` append fallback) | unchanged behaviour on the fallback path. |
| `REQ-discord-048` | `tests/discord.slash-ask7.test.ts` (unchanged) | #208 collapse, deferred reply deleted, fallback Done/fail + reply still hold. |

Full suite: `bunx tsc --noEmit`, `bun test`, `specsync change audit`,
`specsync check --require-coverage 100`, `fledge lanes run verify
--non-interactive`.
