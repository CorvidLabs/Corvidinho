# Lesson bundle — collapsed-ask-pings-notify-when-an-answer-is-delivered-by-editing-the-thinking-message-discord-ask-6-7-and-mentions-the

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Collapsed ask pings notify: when an answer is delivered by editing the thinking message (DISCORD-ASK-6/7) and mentions the requester or owner, one short fresh post pings exactly those users (AUTONOMY-2/4, SAFE-8), without double pings
- **Kind**: BugFix
- **Specs**: discord
- **Paths**: src/discord/ask-ping.ts, src/discord/spend-post.ts, src/discord/bridge.ts, tests/discord.collapsed-ping.test.ts, tests/discord.spend.test.ts, tests/discord.ask-ping.test.ts, tests/discord.ask-ephemeral.test.ts, tests/discord.thin-ack.test.ts, tests/discord.inflight-replies.test.ts, specs/discord
- **Acceptance**: When a chat, button-pick, /work or /session start answer is delivered by editing the thinking message (DISCORD-ASK-6/7 collapse) and that answer mentions the requester (clarify, AUTONOMY-4) and/or the owner (stuck AUTONOMY-2, spend-cap or 80% warning SAFE-8), the bridge sends one short fresh post (a reply to the edited message) containing only those mentions and a one-line pointer (requester: '↑ question for you'; owner: '↑ needs you'), with allowed mentions limited to exactly those users (no @everyone, no roles). No extra post when the answer mentions nobody, when it went out as a fresh reply (fallback path), or for a user a fresh post already pinged this turn (the slash owner notice from #160); a spend-cap ask already pinged this cap episode still carries no owner mention, so no ping. The one-message layout of DISCORD-ASK-6/7 is otherwise unchanged; a failed ping post never fails the turn. No new slash command, env var or schema.

## Evidence

- Verification commit: `4a5cfd5743426e79123f184c64f4a078bd04c52d`
- Base commit: `dc65cf70d4a46d59c35f80acd91822df3eddf3f1`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Bug on `origin/main` @ dc65cf7 (after #204/#208 DISCORD-ASK-6/7 and #160
SAFE-8): answers are delivered by editing the thinking message
(`ThinkingStatus.finalizeContent({ content, components, mentionUserIds })`,
slash via `finishSlashWithThinking`). Discord does not send notifications for
mentions added in a message edit, so on a collapsed answer:

- the clarify ping to the requester (AUTONOMY-4) never notifies — chat,
  button pick, Choose stub, `/work` and `/session start`;
- the stuck ping to the owner (AUTONOMY-2) never notifies on chat and button
  pick (slash already sends the owner a fresh notice post, #160);
- the spend-cap owner ping and the 80% warning owner mention (SAFE-8) riding
  the collapsed chat / button-pick edit never notify.

`allowedMentions` on the edit is correct but irrelevant: Discord only
notifies on create. Only the fallback path (no `editMessage`, or a failed
edit) posts a fresh reply, which notifies.

HI served: AUTONOMY-2 (owner pinged when stuck), AUTONOMY-4 (clarify asks
ping the requester), SAFE-8 (owner warned at 80% and asked at the cap),
DISCORD-ASK-6/7 (one-message layout kept). No new acceptance criteria beyond
those: the fix only makes the existing pings actually notify.

Constraints: keep ASK-6/7's one-message answer; no double pings (reuse the
#160 once-per-episode cap claim and skip users the slash owner notice already
pinged); no ping when the answer was already a fresh reply; allowed mentions
exactly the pinged users; no new slash command, env var or schema.

## From the change's design.md

# Design

- `ask-ping.ts`: `formatCollapsedPing({ mentionUserIds, questionUserIds,
  alreadyPinged })` → `{ content, mentionUserIds } | null`. Ids are trimmed,
  deduped, `alreadyPinged` removed; ids in `questionUserIds` get
  `COLLAPSED_PING_QUESTION` ("↑ question for you"), the rest
  `COLLAPSED_PING_NEEDS` ("↑ needs you"); groups joined with " · " on one
  line. Content is built only from ids and constants (no model text), so it
  needs no scrub or defang.
- `spend-post.ts`: `ChannelPost` gains optional `replyToMessageId` (the
  gateway reply already takes it). `postCollapsedPing({ post, channelId,
  replyToMessageId, mentionUserIds, questionUserIds, alreadyPinged })` formats
  and sends with `mentionUserIds` = exactly the pinged ids (the gateway maps
  that to `allowedMentions { parse: [], users }`); returns null when there is
  no post function, nobody to ping, the post returns null or throws.
- Bridge chat + button pick: right after `finalizeContent` succeeds, call it
  with the answer's `out.mentionUserIds` (ask mention + warning owner), the
  clarify requester as `questionUserIds`, replying to the collapsed message
  id; track the ping message id on the session. The fallback branch is
  untouched (its reply is fresh). Claims (`spend.release` / `askOwner.release`)
  keep their meaning: the answer went out, so a failed ping does not hand them
  back (same as #160's appended notice).
- `finishSlashWithOwnerNotice`: record the body's delivery mode via
  `onDelivered` (chained to the caller's). After a collapsed body: with no
  notice, ping `opts.mentionUserIds` (in a finally, so a throwing
  `deleteReply` still pings, then re-throws); with a notice and a post
  function, ping the collapsed answer's mentions (the body's, or body + owner
  when the notice had to be appended by re-editing) minus
  `notice.mentionUserIds` when the notice post went out. Reply target is
  `thinking.progressMessageId`; the ping is tracked via `trackBotMessage`.
  Without a post function nothing fresh can be sent (unchanged).
- Rejected: pinging by replying to the request message (the gateway's
  `repliedUser: true` would also ping the requester on an owner-only ping);
  moving mentions out of the collapsed answer (keeps ASK-6/7 text intact).

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-215` | `tests/discord.collapsed-ping.test.ts` | 17 tests. Formatter: requester → "↑ question for you", owner → "↑ needs you", both on one line, ids trimmed/deduped, `alreadyPinged` removed, nobody left → null. Bridge (fake gateway reply + fake thinking outbound with `editMessage`): collapsed chat clarify (free text and Choose stub) → exactly one fresh post `<@R> ↑ question for you` replying to the edited answer, allowed mentions exactly [R], one line, no components, no mass/role mention, and a reply to it maps to the session; collapsed stuck → one owner-only `<@O> ↑ needs you`; clarify + pending 80% warning → one post pinging R and O; two spend-cap stops in one episode → one owner ping; no mention → no post; fallback reply (no `editMessage`) → only the answer; failed ping post → turn finishes, answer stays; button pick that gets stuck → one owner ping replying to the stub; button pick answered with no mention → no post; `/work` clarify collapsed → one requester ping, no owner notice; `/session start` clarify by the owner with a pending warning → only the #160 owner notice; `/work` at the cap with a warning → exactly one owner post (the notice); `/work` stuck whose notice post fails and rides the collapsed answer → one owner ping; slash fallback → no ping post. On main (formatter import removed) 9 bridge tests fail and the 6 no-extra-post cases pass; 17/17 after. |
| `REQ-discord-215` | `tests/discord.spend.test.ts` | Collapsed chat answer with the 80% warning → one owner ping post replying to it, none on the next answer; the in-flight test counts that ping; collapsed spend-cap stops ping once per episode; `/session start` clarify → the requester ping after the stuck run's owner notice. |
| `REQ-discord-215` | `tests/discord.ask-ping.test.ts`, `tests/discord.ask-ephemeral.test.ts`, `tests/discord.thin-ack.test.ts`, `tests/discord.inflight-replies.test.ts` | Collapsed clarify / stuck / Choose stub answers now expect the one fresh ping post (requester or owner, exact mentions) instead of no post; the thin-ack restatement is the second reply. |

Also run: `bunx tsc --noEmit`, full `bun test` (twice),
`specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/discord/context.md`
