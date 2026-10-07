---
module: agent
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
---

# Delta: agent (a run condenses its replayed conversation at 80% of its model's own window, and a model writes the summary — SESSION-5.a)

## Added

### REQUIREMENT REQ-agent-473

Each model I configure has its own context window; at about 80% of it, a
model writes the summary of older turns, and the current task and my latest
instructions stay word for word (SESSION-5.a, captured in this change's PR
from Leif's 2026-09-28 interview, round 16 on 2026-10-06; SESSION-5, #72).

Per-model window. A model entry in every model key (`CORVIDINHO_LLM_MODEL`,
`_READ` / `_TOOL` / `_CODE`, `CORVIDINHO_LLM_MODEL_ORDER`) MAY end in
`=TOKENS`; `parseModelEntry` SHALL read a positive whole number there into
`ModelEntry.windowTokens` and SHALL NOT keep the suffix in the model id or
its label (`=0` is no window). A model has one window wherever it is
listed: `modelWindowTokens(entry, env)` (`src/agent/condense.ts`) SHALL be
the entry's own window, else the window on the first entry naming the same
model (`kind:model`) in `CORVIDINHO_LLM_MODEL`, `_READ`, `_TOOL`, `_CODE`,
`CORVIDINHO_LLM_MODEL_ORDER` (`configuredWindowTokens`), raised to 1024,
else `CORVIDINHO_LLM_CONTEXT_TOKENS`, else 8192 — today's behaviour for a
model with none.

Whole prompt, the current model's window. `createTaskExecute` given the
conversation a bridge replayed into its task (`conversation`:
`ConversationReplay` — header, footer, summary, turns) SHALL, before an
attempt's first model call (tool loop and read tier), find the conversation's
block in the task (`formatConversationBlock` of it) and measure the whole
prompt the model will see — the system prompt (persona, rules, project
instructions, repo ways), the user message (task with its memory and identity
blocks, the conversation and the new message; spec briefing, verify
feedback, attempt line) and the tool schemas — in characters. When that
reaches 80% of the window of the model the call goes to (the chain's current
entry), at 4 chars per token, it SHALL fold the oldest turns
(`condenseConversation` with `fixedChars`), never the opening human turn
(the task) or the newest human turn (the latest instruction), and never touch
the new message. No transport ceiling SHALL cap the budget
(`condenseBudgetChars` is 80% of the window).

A model writes the summary. The run SHALL send one no-tools summary call to
that model through its own call path and SAFE-8 spend guard (it counts toward
every spend cap and its worst-case reply is reserved like any call, AUTONOMY-8
/ 8.a), never failed over: a bounded prompt (`summaryMessages`: the earlier
summary to fold in and the folded turns, within half the window, older ones
shortened to their extractive point and then left out with a count) that never
holds the task, the latest instruction or the new message. Its reply SHALL be
kept as one scrubbed line `- Summary: …` (`modelSummaryLine`) within the
room left under 80% (at least 200 chars, at most half the summary cap),
inside an untrusted-data fence of source `model-summary` when what it
summarized held one or the run is a non-owner's (a role session whose acting
role is not `owner`: the turns are their words, SAFE-12); the block SHALL carry it after the task with
the kept turns, the latest instruction among them, word for word. When the
call fails as a model (HTTP error, timeout, network error, malformed or empty
reply, missing key), the extractive summary SHALL stand in and one
`[operator] SESSION-5.a: … <model> did not write the summary (<reason>), so it
is the extractive one` Text event SHALL say so; a spend-cap stop or the run's
own stop SHALL end the attempt like any stopped model call (the spend-cap
ask). One summary call per run: an attempt that condensed keeps its outcome
for later attempts; while nothing needs condensing each attempt measures
again. What it did SHALL reach `CreateTaskExecuteOpts.onCondensed` as a
`CondenseReport` (summary, folded indexes ascending, `by` model or
extractive, model label, window, reason). Nothing condenses inside one
attempt's tool loop.

Acceptance Criteria
- `fake-model=100000` with `CORVIDINHO_LLM_CONTEXT_TOKENS=5000` condenses nothing; `fake-model=5000` with the fallback at 100000 condenses, reports window 5000, and the provider gets `fake-model` (`tests/agent.condense.test.ts`).
- An entry with no window uses `CORVIDINHO_LLM_CONTEXT_TOKENS`; with neither, 8192.
- A window set only on the model's entry in `CORVIDINHO_LLM_MODEL_ORDER` (or another tier's key) is that model's window: `fake-model` with `fake-model=<w>` in the order condenses at 80% of `<w>` whatever the fallback says; the entry's own window wins, and another model's (or the same id of another kind) never counts.
- A conversation and message under 80% of the window whose whole prompt (with the system prompt and tool schemas) is over it is condensed, and the condensed prompt is under 80%; the read tier condenses the same way.
- The prompt carries `- Summary: <the model's words>`, not the folded turns; the summary call holds the folded turns but never the task, the latest instruction or the new message; the task and latest instruction stay `Human: …` lines word for word; folded indexes never name them.
- The summary prompt stays within half the window and folds an earlier summary in; a second attempt makes no second summary call; a summary of fenced text is fenced `model-summary`, and so is the summary in a team member's run (`CORVIDINHO_ACTING_ROLE=team`), never in the owner's.
- HTTP 500 or an empty reply on the summary call: extractive points, the `[operator]` line with the reason, the answer still from the head model (no failover).
- Under a spend cap the summary call and the answer are both ledger rows; at a 0 cap nothing is sent and the run ends with the spend-cap ask.
