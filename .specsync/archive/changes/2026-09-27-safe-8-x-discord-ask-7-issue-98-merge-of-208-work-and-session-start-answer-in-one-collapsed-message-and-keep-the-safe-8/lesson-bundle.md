# Lesson bundle — safe-8-x-discord-ask-7-issue-98-merge-of-208-work-and-session-start-answer-in-one-collapsed-message-and-keep-the-safe-8

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: SAFE-8 x DISCORD-ASK-7 (issue #98, merge of #208): /work and /session start answer in one collapsed message and keep the SAFE-8 owner notice a fresh channel post; an ask run never shows Done, and claims go back when nothing carried the notice
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/slash-finish.ts, src/discord/spend-post.ts, src/discord/command-handlers/work.ts, src/discord/command-handlers/session.ts, tests/discord.spend.test.ts, specs/discord/
- **Acceptance**: When the thinking message can be edited, /work and /session start answer in one message (DISCORD-ASK-7: the thinking message becomes the answer and the deferred reply is deleted) that carries the ask content: a clarify ask addresses the requester (allowed mentions limited to them), a stuck or spend-cap stop shows the ask, never ✅ Done, and /work records it blocked (stuck stays failed). The owner ping for a stuck or spend-cap ask (once per cap episode) and the pending SAFE-8 80% warning go out as a fresh channel post with allowed mentions limited to the owner; when that post cannot be sent the notice is appended to the answer that went out (the collapsed message edited again, or the fallback reply); without an edit the fallback status shows the ask status, not Done. When nothing carried the notice (answer and owner post both failed, e.g. an expired interaction token) the claimed warning and cap ping are handed back to the next bridge post and the answer's error is still raised. #208 slash tests pass unchanged; fixture tests only.

## Evidence

- Verification commit: `45e537537f6d5c8655d0401c5afd703036853aed`
- Base commit: `f9dc47ff912aa4682d102d73aa8e62018717c63f`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

PR #160 (SAFE-8 as amended on #98) was finalized on its branch when main
took #208 (DISCORD-ASK-7 slash one-message, v0.0.25). #208 replaced the
`/work` and `/session start` reply with `finishSlashWithThinking`
(`src/discord/slash-finish.ts`): the thinking message is edited into the
final body and the deferred interaction reply is deleted; without
`editMessage` it falls back to a Done/fail status plus the reply.

#160 had, on the same lines, `askPingOwner` + `formatAskReply` (ask status,
AUTONOMY-4 requester addressing), `slashOwnerNotice` and
`replyWithOwnerNotice` (owner ping for stuck / spend-cap plus the 80% warning
as a fresh channel post, claims handed back when nothing went out, notice
still posted when the reply throws). Merging both made the two
command handlers conflict, and `finishSlashWithThinking` alone would have
shown an ask run as "✅ Done" in the fallback and dropped the owner notice.

Constraint from the coordinator: keep #208's collapse and its tests; keep
the owner notice a fresh post (an edit does not notify mentions); an ask run
never shows Done; claims go back when nothing carried the notice.

## From the change's design.md

# Design

- `src/discord/slash-finish.ts` — `finishSlashWithThinking` gains three
  optional fields; without them it behaves exactly as #208 wrote it:
  - `askStatus` `{ status, failed }`: the fallback status for a run that
    stopped to ask (`failed` for stuck), so it never shows "✅ Done".
  - `mentionUserIds`: the collapsed answer's allowed mentions (the clarify
    requester; empty for stuck / spend-cap, whose owner ping is the notice).
  - `onDelivered(mode)`: called once the answer is out (collapsed edit or
    fallback reply), before the deferred reply is resolved, so a caller knows
    the answer went out even when `deleteReply` / `editReply` then throws.
- `src/discord/spend-post.ts` — `finishSlashWithOwnerNotice` replaces
  `replyWithOwnerNotice`: no notice ⇒ plain `finishSlashWithThinking`; no
  post function ⇒ the notice rides the answer (collapsed or reply); else the
  answer goes out, then the notice as a fresh post (owner-only mentions); if
  that post fails it is appended to the answer that went out (the collapsed
  message is edited again — `finalizeContent` edits a closed status that
  still has its message id — or the reply re-edited); when nothing carried
  it, `notice.release()` hands the warning and the cap ping back; the
  answer's error is re-thrown after the notice step.
- `/work` and `/session start` drop their early `thinking.done/fail` and
  pass `askStatus` + `mentionUserIds` from `formatAskReply`, the
  `slashOwnerNotice` and `ctx.post` to `finishSlashWithOwnerNotice`.

## From the change's testing.md

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

## Where these lessons go

- `specs/discord/context.md`
