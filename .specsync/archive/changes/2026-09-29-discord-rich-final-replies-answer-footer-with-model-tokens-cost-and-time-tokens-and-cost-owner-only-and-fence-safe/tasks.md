---
change: discord-rich-final-replies-answer-footer-with-model-tokens-cost-and-time-tokens-and-cost-owner-only-and-fence-safe
artifact: tasks
---

# Tasks

- [x] Re-verify the gap on the stacked base d589638 (footer without tokens / cost / time; `~tok` for everyone; answers cut at 1800 / 1500; gateway 1900); DISCORD-15 / 15.a / 16 already captured in `hi/discord.md` there (`hi check` green), not captured again.
- [x] `src/discord/rich-reply.ts`: `splitDiscordMessage`, `readsBetterAsEmbed`, `planAnswerParts`, `postAnswerParts`, `answerSpendFor`, `DISCORD_MESSAGE_MAX` / `DISCORD_EMBED_DESCRIPTION_MAX` / `DISCORD_ANSWER_MAX`.
- [x] `thinking-status.ts`: `AnswerSpend`, `AnswerExtras`, `formatAnswerFooter`, `buildAnswerFooterEmbed` (time, spend), `ThinkingStatus` `showUsage` / `elapsedMs` / `answerFooter` / multi-part `finalizeContent` (`FinalizedAnswer`), `ThinkingOutbound.sendMessage`.
- [x] Agent: `collectTaskRunStream` returns `usage` and takes `bodyMax`; `chatBodyFromTaskResult` optional `max` (`CHAT_BODY_MAX`).
- [x] Discord spawn client passes `bodyMax: DISCORD_ANSWER_MAX` and returns `usage`; `AgentSpawnResult.usage`.
- [x] Bridge chat and button-pick paths, `/work`, `/session start`: owner-only spend and live token use, whole answer, every part tracked, fallback replies split with the footer; `finishSlashWithThinking` `post`; `finishSlashWithOwnerNotice` appends without cutting a split answer; `withSpendWarningPost` optional `max`.
- [x] Gateway: `reply` takes `embed`; reply / editMessage / slash adapter cap 2000.
- [x] Tests: `tests/discord.rich-reply.unit.test.ts` (18), `tests/discord.rich-replies.test.ts` (14; 13 fail on the base sources, the WATCH-cap guard passes on both); footer assertions in thinking-status, thinking-bridge, slash-ask7, ask-ping, spend and inflight-replies tests include the time (owner runs: tokens / cost).
- [x] `docs/discord.md` (answer footer, long answers, limits table, source map); `specs/discord/discord.spec.md` (prose, `files:`), `specs/discord/testing.md`, `specs/agent/agent.spec.md`; deltas Added REQ-discord-075, Modified REQ-discord-457 and REQ-agent-073.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
