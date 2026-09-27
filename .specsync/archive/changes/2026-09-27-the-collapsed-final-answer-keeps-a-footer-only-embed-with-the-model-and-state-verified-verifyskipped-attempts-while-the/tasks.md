---
change: the-collapsed-final-answer-keeps-a-footer-only-embed-with-the-model-and-state-verified-verifyskipped-attempts-while-the
artifact: tasks
---

# Tasks

- [x] Repro on main: the collapsed answer is edited with `embed: null`, so model and plumbing are shown nowhere on the normal path.
- [x] `buildAnswerFooterEmbed` + `finalizeContent` `extras`/`failed`; Choose stub (components) keeps `embed: null`; re-edit keeps the footer.
- [x] Wire `thinkExtras` and the fallback's failed/done outcome from the bridge chat path, the button-pick resume path and `finishSlashWithThinking`.
- [x] Regression tests in `tests/discord.thinking-status.test.ts`, `tests/discord.thinking-bridge.test.ts`, `tests/discord.slash-ask7.test.ts`; collapse assertions in ask-ping, spend and inflight-replies tests updated. The 13 new/updated assertions fail with main's sources swapped in and pass on the branch.
- [x] Delta: Added REQ-discord-457; canonical `requirements.md`, `discord.spec.md`, `testing.md` and `docs/discord.md` updated.
- [x] `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage 100`, `fledge lanes run verify --non-interactive` green.
