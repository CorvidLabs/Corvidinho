---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: testing
---

# Testing

New: `tests/agent.condense.test.ts` (20 tests; an injected fake fetch, the
localhost fake provider `tests/fixtures/fake-llm.ts` and fake
`corvidinho` bins; no network, no keys). Its in-process cases calibrate
the window from a run that condenses nothing, in the same process (the tool
catalog holds whatever plugins are registered), and pick one whose 80% lies
60% of the way into the conversation, past the system prompt and tools.

- Per-model window: `fake-model=<huge>` with a small
  `CORVIDINHO_LLM_CONTEXT_TOKENS` condenses nothing; `fake-model=<w>` with a
  huge fallback condenses, reports window `w`, and the provider gets
  `fake-model` (no suffix); an entry without a window uses the fallback,
  and with neither, 8192.
- Whole prompt: the conversation and message are under 80% of `w` while the
  whole prompt is over it, and it is condensed to under the budget; above
  the whole prompt nothing is folded; the read tier condenses the same way.
- Model summary: the prompt carries `- Summary: <model words>` and not the
  folded turns; the summary call holds the folded turns but never the task,
  the latest instruction or the new message; folded indexes never name the
  pinned turns; the summary prompt stays within half the window and folds an
  earlier summary in; a second attempt makes no second summary call; a
  summary of fenced text is fenced `model-summary`.
- Fallback: HTTP 500 or an empty reply on the summary call keeps the
  extractive points, emits the `[operator] SESSION-5.a … did not write the
  summary (<reason>)` line, and the answer still comes from the head model
  (no failover with a second entry configured).
- Spend: under a cap both calls are `spend_ledger` rows; at a 0 cap nothing
  is sent and the run ends with the spend-cap ask.
- `task run --task-stdin` (spawned CLI): a conversation over 128 KiB reaches
  the model whole when the window holds it; at 80% of
  `ollama:fake-model=5000` the NDJSON result carries the report; `--task`
  with `--task-stdin` and a non-JSON payload are refused with no model call.
- Discord and WATCH clients: `--task-stdin`, the task and conversation as
  JSON on stdin, the report checked (pinned and out-of-range indexes
  dropped, summary scrubbed); with no conversation, `--task` as before.

Updated: `tests/session.condense.test.ts` (no transport ceiling;
`=TOKENS` parsing and `modelWindowTokens`; `threadPrompt` folds nothing
and `replayFor` is the block's conversation; `applyCondensed` drops the
folded turns and rows and stores the scrubbed summary, keeps a turn-cap point
after it, leaves an ended session alone; restart picks up from it; the
model line leads the summary and is never shortened for a point;
`condenseReportFromUnknown`, `withoutFolded`, the stdin payload),
`tests/discord.session-resume.test.ts` (the bridge hands the run the whole
conversation and keeps its reported model summary; the TTL resume carries
it; an extractive report is logged), `tests/watch.conversation.test.ts`
(the same on WATCH, stored record included), `tests/store.conversation.test.ts`
(forget tests seed the summary with `applyCondensed`),
`tests/discord.session-thread.unit.test.ts` (the block is whole by default;
the omitted-marker safety net with an explicit budget).

Fail-on-base proof: with the base's (54d6a6c7, origin/main) thirteen sources
swapped in (`src/agent/{execute,providers,types}.ts`, `src/cli.ts`,
`src/discord/{agent-client,bridge,session-store,session-thread,types}.ts`,
`src/store/conversation.ts`, `src/watch/{agent-client,poller,types}.ts`)
and `src/agent/condense.ts` removed: `agent.condense` 3 pass / 17 fail (only
the cap-0 stop and the two no-conversation `--task` guards pass),
`session.condense` cannot load, `discord.session-resume` 10 / 3 fail,
`watch.conversation` 4 / 2 fail, `discord.session-thread.unit` 13 / 1 fail,
`store.conversation` 9 / 2 fail. Restored: all pass.

Review fixes (adversarial review of PR #405): a window set only on the
model's entry in the order is its window (`agent.condense`, and
`modelWindowTokens` across keys in `session.condense`); a team member's run
fences the model's summary, the owner's does not (`agent.condense`);
`applyCondensed` stores nothing for a thread forgotten while its run ran,
and a report with an empty summary is refused (`session.condense`). With
the first PR head's (c3300876) `condense.ts`, `execute.ts`,
`session-store.ts` and `conversation.ts` swapped in, those 5 cases fail;
restored, all pass. REQ-discord-072 is corrected for what this change made
false (no 32000-char safety net, a model-written summary, `--task-stdin`).

Full suite on this branch (rebased on 0.0.43, c70bbe9b): `bun test` 3948
pass, 2 skip, 0 fail (3950 tests in 250 files); `bunx tsc --noEmit` clean;
`specsync check --require-coverage 100` 227/227 files.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-473` | `tests/agent.condense.test.ts` (per-model window, whole-prompt trigger, read tier, model summary, pinned verbatim, bounded summary prompt, one call per run, SAFE-12 fence, HTTP 500 / empty fallback, spend ledger, cap 0); `tests/session.condense.test.ts` (`=TOKENS`, `modelWindowTokens`, model line in `appendSummary`) | The window is the entry's, else the fallback, else 8192; condensing starts at 80% of the whole prompt; the model's words are the summary; the task and latest instruction stay word for word and never reach the summary call; failures fall back and say so; the summary call is in the spend ledger and stopped at the cap. |
| `REQ-cli-473` | `tests/agent.condense.test.ts` (`task run --task-stdin` cases; Discord / WATCH client cases); `tests/session.condense.test.ts` (stdin payload) | Over-128-KiB conversations reach the model; the NDJSON result carries the report; bad input is refused before any call; the clients use stdin only with a conversation and check the report against the replay. |
| `REQ-discord-072` | `tests/discord.session-thread.unit.test.ts` (whole by default; explicit budget marker); `tests/discord.session-resume.test.ts` | The block is whole with no transport ceiling; the run condenses it and the summary is the model's (REQ-discord-472). |
| `REQ-discord-472` | `tests/session.condense.test.ts` (SessionStore describe, forget-while-running); `tests/discord.session-resume.test.ts` (SESSION-5.a describe, SESSION-3.a resume); `tests/store.conversation.test.ts`; `tests/discord.session-thread.unit.test.ts` | The bridge folds nothing, hands the run the block's conversation, keeps the reported summary (stored, scrubbed, restart-safe, resumed after the TTL) and drops the folded turns; extractive reports are logged. |
| `REQ-watch-472` | `tests/watch.conversation.test.ts` | The run gets the thread's whole conversation; the thread keeps the reported summary without the folded turns; extractive reports are logged. |
| all | full `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`, `hi check`, `fledge lanes run verify --non-interactive` | Run on this branch before push. |
