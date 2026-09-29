---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: design
---

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
