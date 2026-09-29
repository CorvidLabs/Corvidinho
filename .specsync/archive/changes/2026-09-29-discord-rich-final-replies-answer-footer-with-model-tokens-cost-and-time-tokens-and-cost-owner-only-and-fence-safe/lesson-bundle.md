# Lesson bundle — discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Discord rich final replies: answer footer with model, tokens, cost and time (tokens and cost owner-only) and fence-safe splits at 2000 (DISCORD-15/15.a/16)
- **Kind**: Feature
- **Specs**: discord, agent
- **Paths**: src/agent/events-ndjson.ts, src/agent/task-summary.ts, src/discord/agent-client.ts, src/discord/ask-ping.ts, src/discord/bridge.ts, src/discord/command-handlers/session.ts, src/discord/command-handlers/work.ts, src/discord/gateway.ts, src/discord/slash-finish.ts, src/discord/spend-post.ts, src/discord/thinking-status.ts, src/discord/types.ts, src/discord/rich-reply.ts, src/discord/injection-guard.ts, tests/discord.allowed-mentions.test.ts, tests/discord.ask-ping.test.ts, tests/discord.inflight-replies.test.ts, tests/discord.slash-ask7.test.ts, tests/discord.spend.test.ts, tests/discord.thinking-bridge.test.ts, tests/discord.thinking-status.test.ts, tests/discord.rich-replies.test.ts, tests/discord.rich-reply.unit.test.ts, docs/discord.md, specs/discord/discord.spec.md, specs/discord/testing.md, specs/agent/agent.spec.md
- **Acceptance**: Every Discord answer (chat reply, button-pick resume, /work, /session start, and their reply fallbacks) carries a footer embed with the model and the time, plus tokens and cost only when the acting user is the configured owner; an owner run with no provider usage or no known model price shows tokens unknown / cost unknown, never $0; the live thinking status shows token use on owner runs only; an answer over 2000 characters is split into messages of at most 2000 characters that never break a fenced code block (closed at a part end, reopened with the same language), keep the ROLES-CHAT-3 role note whole in the last part, are secret-scrubbed before the split, carry the footer on the last part, and long plain prose with no code or mention that fits one embed goes out as one embed; the Discord spawn client passes the whole answer (result frame cap 4000) and the last usage frame while WATCH keeps its 1800 cap; tests/discord.rich-replies.test.ts fails on the base sources and passes on the branch

## Evidence

- Verification commit: `f009b59a919b32d40432a2a4712771a8a1077413`
- Base commit: `d589638c38f27503373601bb256ee6207fb822f9`
- Verified by: `specsync check --spec agent --spec discord`

## From the change's context.md

# Context

Issue #75 (M2 "Talk anywhere"). Captured HI (`hi/discord.md`, captured on the
stacked base `claude/hi-capture-interview-2026-09-28` from Leif's 2026-09-28
interview; not captured again here):

- **DISCORD-15** "Every answer carries a small footer with model, tokens, cost
  and time; a cost it doesn't know shows as unknown, never $0."
- **DISCORD-15.a** "Tokens and cost show only in my own runs' footers;
  everyone else sees model and time."
- **DISCORD-16** "Long answers are split at Discord's 2000-character limit
  without breaking code fences, using embeds where they read better than plain
  text."

Related captured criteria that still hold: SAFE-14.a (only the owner sees
spend amounts), SAFE-16 (an unknown price shows as unknown, never free),
SAFE-6 (scrub), ROLES-CHAT-3 (closing role note), DISCORD-3 / DISCORD-3.a
(live status, plumbing in the footer), DISCORD-ASK-6/7 (collapse into one
message), AGENT-6 / DISCORD-2 (reply continuity).

Gap on the base (d589638): the collapsed answer's footer (#260, REQ-discord-457)
is `model | state=… verified=… attempts=…` only (no tokens, cost or time);
the live thinking status shows `~tok` to everyone; chat bodies are cut to
1800 characters (`chatBodyFromTaskResult`, then `result.summary.slice(0,
1800)` in the bridge and `slice(0, 1500)` in `/work` / `/session start`),
so an answer past that is silently truncated, often mid code block; the
gateway slices every post at 1900.

Constraints: reuse the SAFE-8 price table (`priceForModel`, `costMicroUsd`,
`formatUsd`), the owner check (`isOwnerDiscord`, ADMIN is owner-only), the
scrubber, the role-note helpers and the existing collapse / fallback paths; no
new env var, config key, slash command, schema or protocol change. WATCH
comments and schedule posts keep their own caps. #232 / #233 are landed
separately and are out of scope. Specs change only through this SpecSync
change.

## From the change's design.md

# Design

- New `src/discord/rich-reply.ts` (discord module):
  - `splitDiscordMessage(text, max = 2000)`: text within `max` unchanged.
    Otherwise a line-oriented greedy fill that tracks fence state (a line with
    an odd number of triple-backtick runs toggles it). While inside a block
    every part keeps 4 characters for a closing fence line; a part that runs
    out inside a block closes it and the next starts with a fence line
    carrying the block's language. A block that
    opened partway through a part moves whole to the next part. A line longer
    than a part is cut at a space in its back half, else hard, never inside a
    surrogate pair. A fence open at the end is closed. The ROLES-CHAT-3 tail
    (`\n\n(not allowed for your role)`) is split off first and appended to the
    last part (or becomes the last part).
  - `planAnswerParts(text, { footer, allowEmbed })`: `scrubSecrets` first
    (SAFE-6), then one plain part with the footer (≤ 2000), or one embed with
    the text as description and the footer (`readsBetterAsEmbed`: > 2000,
    ≤ 4096, no code fence, no `<@…>` mention; callers allow it only without
    buttons or mentions to ping), else split parts with the footer on the last.
  - `postAnswerParts(post, …)` for fresh-reply paths: first part replies to
    the request with the answer's mentions; later parts reply to nothing and
    allow only users first mentioned in them (`[]` by default); buttons on
    the last part.
  - `answerSpendFor(usage, model)`: tokens = provider total when > 0; cost
    = `costMicroUsd(priceForModel(model), usage)` when priced and > 0; a
    field left out is unknown.
- `thinking-status.ts`: `AnswerSpend`, `AnswerExtras` (`plumbing`,
  `model`, `spend`), `formatAnswerFooter` (`model | [tokens | cost |]
  time | plumbing`, `tokens unknown` / `cost unknown`),
  `buildAnswerFooterEmbed` gains `elapsedMs` / `spend`.
  `ThinkingStatus`: `showUsage` (default false) hides `~tok` on non-owner
  runs; `elapsedMs` / `answerFooter()` freeze the time at the first
  answer; `finalizeContent` plans the parts, edits the first into the
  progress message, posts the rest with optional `ThinkingOutbound.sendMessage`
  (`mentionUserIds: []`), remembers each part so a re-edit (notice appended)
  edits only what changed, and returns `{ messageId, messageIds, complete }`
  (null when more parts are needed than `sendMessage` can post).
- Callers: bridge chat + pick, `/work`, `/session start` compute
  `ownerRun = isOwnerDiscord(owner, actor)`, pass `showUsage: ownerRun` and
  `spend: answerSpendFor(result.usage, model)` only for owner runs, use the
  whole `result.summary` (no 1800 / 1500 cut), track every part id for
  replies, record a stub's id from the last part; fallback replies use
  `postAnswerParts` with `answerFooter`. `finishSlashWithThinking` gets
  optional `post` for the parts after the deferred reply;
  `finishSlashWithOwnerNotice` appends without cutting (`DISCORD_ANSWER_MAX`),
  counts a collapsed re-edit only when `complete`, and re-edits a fallback
  deferred reply only for a one-message answer (old 1900 clip kept there).
  `withSpendWarningPost` takes an optional `max` (chat passes
  `DISCORD_ANSWER_MAX`; schedules keep 1900).
- Agent module: `collectTaskRunStream` returns the last `usage` frame and
  takes optional `bodyMax`; `chatBodyFromTaskResult(r, max = 1800)`. The
  Discord spawn client passes `bodyMax: DISCORD_ANSWER_MAX` (6000) and
  returns `AgentSpawnResult.usage`. WATCH and delegates keep 1800.
- Gateway: `reply` takes an optional `embed` (content omitted when empty);
  `reply`, `editMessage` and the slash adapter cap content at 2000.
- Rejected: pricing in the child and a new `TaskResult` field (wire change,
  no need); raising the 4000 result-frame cap (protocol / flood risk — left for
  Leif); a knob to turn footers or splitting off (captured text sets it);
  embeds for every long answer (code must stay plain; mentions must ping);
  showing ADMIN-list users spend (ADMIN is owner-only anyway).

## From the change's testing.md

# Testing

Fixture tests only: `startBridge` with a null gateway, in-memory thinking
outbound, injected agents and fake slash / component interactions; fake-bin
spawn clients; the live gateway with its socket connect stubbed. No live
Discord, no network, no token.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-discord-075` | `tests/discord.rich-replies.test.ts` (chat) | A 5066-character answer with a code block across the 2000 mark: the first part is edited into the thinking message, the rest are fresh `sendMessage` posts; every part ≤ 2000 with balanced fences; all lines kept in order; the footer (`model \| Ns`, non-owner) only on the last part; no fallback reply; each part's id maps to the session. Long plain prose → one embed (description = the answer, footer), no posts. The role note ends the last part and no earlier part carries it. Without `editMessage` the fallback reply is split the same way: first part replies to the request, later parts reply to nothing with `mentionUserIds: []`, footer on the last. A split fallback reply with a SAFE-8 80% warning (owner configured): the warning line holding `<@owner>` lands in a later part, that part carries `mentionUserIds: [owner]` and every other later part `[]` (review fix: the owner was pre-marked as pinged by the first part, which held no mention of them, so the owner was never pinged). A button-pick resume's long answer is split into the stub the same way. |
| `REQ-discord-075` | `tests/discord.rich-replies.test.ts` (SAFE-13 after merging main) | A run reporting `injection` (owner configured) on a long answer: `withInjectionNotice` appends the SAFE-13 line within `DISCORD_ANSWER_MAX`, so the whole answer is still split (not cut to 1900). Fallback reply: the line holding `<@owner>` lands in a later part, that part allows `[owner]` and every other later part `[]`. Collapsed: every answer line and the role note kept, the note whole once in the last part before the line, and exactly one ping post for the owner. Both fail with the SAFE-13 append at its default 1900 cap. |
| `REQ-discord-075` | `tests/discord.rich-replies.test.ts` (`/work`, `/session start`) | `/work` (owner) collapsed answer: header + answer split, every part ≤ 2000 with balanced fences, answer lines kept, footer `model \| tokens unknown \| cost unknown \| Ns` only on the last posted part. `/session start` without `editMessage`: the deferred reply holds part one, `ctx.post` posts the rest with `mentionUserIds: []`, footer on the last. |
| `REQ-discord-075` / `REQ-agent-073` | `tests/discord.rich-replies.test.ts` (spawn clients) | Fake bin streaming a `usage` frame and a 3829-character result: the Discord client returns the summary uncut and `usage` `{1200, 300, 1500}`; the WATCH client returns the same summary cut at 1800 (guard, passes on base too). |
| `REQ-discord-075` | `tests/discord.rich-replies.test.ts` (live gateway) | `handlers.reply` with a 2000-character part and an embed sends all 2000 characters and the embed (base: cut to 1900, no embed). |
| `REQ-discord-075` | `tests/discord.rich-reply.unit.test.ts` | `splitDiscordMessage`: ≤ 2000 unchanged; prose split on line breaks, joined back exactly; a long block closed at a part end and reopened with `ts`; a block that fits moves whole to the next part; an open fence at the end closed; a long line cut at spaces (`join(" ")` restores it); no lone surrogate at a hard cut; the role note whole in the last part (or the last part itself; after an open block, closed first). `planAnswerParts`: short → one message with the footer; a token across char 2000 is redacted before the split; long prose → one embed; code / mention / not allowed → split, footer on the last. `planAnswerParts` cuts a text over `DISCORD_ANSWER_MAX` to it (`…`, role note kept, every part ≤ 2000). `postAnswerParts`: first part replies with the answer's mentions, later parts reply to nothing and allow only a listed user first mentioned in them (the owner line in the last part pings the owner; a mention already in the skipped first part is not pinged again), footer on the last; a failed first post → null. |
| `REQ-discord-457` | `tests/discord.rich-replies.test.ts` (footer) | Owner run with usage `{1000, 500, 1500}`: footer `model \| 2k tokens \| <priced cost> \| Ns`. Owner run without usage: `model \| tokens unknown \| cost unknown \| Ns`, no `$0`. Non-owner run with usage: `model \| Ns`, no `token`, no `$`. Live status: a non-owner run's footers never show `tok`; the owner's show `~250 tok`. |
| `REQ-discord-457` | `tests/discord.rich-replies.test.ts` (Answer button after merging main) | A clarify ask without listable options (DISCORD-ASK-4.a, REQ-discord-548): the collapsed stub carries one Answer button and the `model \| Ns` footer; without `editMessage` the fallback reply carries the Answer button and the same footer (`postAnswerParts` `keepFooter`), and its id is the ask's `stubMessageId`. Fails with the fallback dropping the footer whenever components are present. |
| `REQ-discord-457` | `tests/discord.rich-reply.unit.test.ts`, `tests/discord.thinking-status.test.ts` | `answerSpendFor`: priced model → tokens and cost > 0; unpriced → tokens only; no usage / zero tokens → nothing. `formatAnswerFooter`: owner order `model \| tokens \| cost \| time \| plumbing`; unknown words, never `$0`; without spend model and time only. `finalizeContent` (fixed clock): `gpt-test \| 0s \| <plumbing>`, error color when failed, a re-edit keeps the same footer, a Choose stub has none, with nothing else known the footer is the time. |
| `REQ-discord-457` | `tests/discord.thinking-bridge.test.ts`, `tests/discord.slash-ask7.test.ts`, `tests/discord.ask-ping.test.ts`, `tests/discord.spend.test.ts`, `tests/discord.inflight-replies.test.ts` | Existing collapse assertions now expect the time segment (`model \| Ns [\| plumbing]`); the `/session start` and `/work` owner runs expect `tokens unknown \| cost unknown`. |

Fail-on-base proof: with the base's `src/` (d589638) swapped in and
`src/discord/rich-reply.ts` removed, `tests/discord.rich-replies.test.ts`
ran 13 fail / 1 pass (the WATCH 1800-cap guard); restored, 14 pass. The
review's added owner-ping case fails on the base (no split) and on the
pre-fix branch module (owner not allowed on the part with the warning); the
unit cap and ping cases fail on the pre-fix module; all pass with the fix
(15 + 18). The unit
file cannot load on the base (no `rich-reply.ts`).

Full suite: `bun test` green; `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 100%; `hi check` green;
`fledge lanes run verify --non-interactive` completed.

## Where these lessons go

- `specs/discord/context.md`
- `specs/agent/context.md`
