---
module: discord
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
---

# Delta: discord (the answer names the model that answered and prices each model; a failover is logged — AGENT-11)

## Added

### REQUIREMENT REQ-discord-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the run side is REQ-agent-080). The Discord spawn client SHALL
return, from the child's `result` frame, `AgentSpawnResult.model` (the
configured model that answered, `modelLabelFromUnknown`), `modelFallback`
(`modelFallbackFromUnknown`) and `usageByModel` (`modelUsageFromUnknown`,
else the last `usage` frame's `byModel`), all validated, scrubbed and
bounded. When a run reports failovers the client SHALL call its
`onModelFallback(hops, sessionId)` option, by default one warn line
`[discord] llm.fallback: <a> failed (<reason>), fell back to <b>[; …] (session
<id>)` (`warnModelFallback`); the daemon passes its structured logger
(REQ-cli-080). There SHALL be no owner DM for a failover: in a run that is not
the owner's, the owner learns of it from that line and the answer's note. The
answer's closing `(model fallback: …)` note SHALL reach the channel on every
surface (chat reply, button-pick resume, `/session start`, `/work`, schedule
posts) and `splitDiscordMessage` SHALL keep it whole in the last part, before
a role note (`closingNotesTail`). The answer footer's model SHALL be
`answerModelFor(result, configured)`: the run's `model`, followed by `(fell
back from <a>[, <b>])` when its own chain failed over (a worker's failover,
`via`, is not the answering model's), else the configured model as before;
everyone sees it (DISCORD-15.a: model and time). On the owner's own runs only,
`answerSpendFor(usage, model, usageByModel)` SHALL price each model's tokens at
its own price (`priceForModel` of the label without its `kind:`) and sum
them; one model with tokens and no known price SHALL make the cost `cost
unknown`, never a partial sum or `$0` (SAFE-16). No env var, config key, slash
command or schema change is added.

Acceptance Criteria
- A fake bin whose result frame carries `model`, `modelFallback` and `usageByModel`: `runChat` returns them, calls `onModelFallback` with the hops and the session id; without the option it logs `[discord] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1 (session s2)`.
- `answerSpendFor(usage, "gpt-4.1", byModel)` is the sum of `gpt-5`'s and `gpt-4.1`'s own costs; a byModel row for `ollama:local` with tokens gives `{ totalTokens }` only; `anthropic:claude-sonnet-5` is priced as `claude-sonnet-5`.
- A dry-run bridge answering the owner's mention with a run that fell back: the collapsed answer keeps the note, and the footer is `gpt-4.1 (fell back from gpt-5) | 3k tokens | $<sum> | <time>`.
- The same run for anyone else: `gpt-4.1 (fell back from gpt-5) | <time>`, no `token`, no `$`.
- A long answer ending in the note is split with the note whole in the last part.

## Modified

### REQUIREMENT REQ-discord-457

When the bridge edits the thinking progress message into the final answer
(DISCORD-ASK-7: an @mention or reply, the answer to a run a button pick
resumed, `/session start`, `/work`), the edit SHALL keep one footer-only embed
(no description) whose footer text is the LLM model — the configured model
that answered, with `(fell back from …)` after a failover (AGENT-11,
REQ-discord-080) — then — only when the
acting user is the configured owner (DISCORD-15.a, SAFE-14.a) — the run's
tokens and cost, then the time the answer took, then the run's plumbing
(`state=… verified=… [verifySkipped] [cancelled] attempts=…`), joined by
` | `, so they stay visible without entering the answer body (DISCORD-3.a,
DISCORD-15). Tokens SHALL be the run's provider-reported total and the cost
that usage priced at the model's known list price (the SAFE-8 table; with
usage per model, each model's tokens at its own price, REQ-discord-080); with no
usage reported the footer SHALL say `tokens unknown`, and with no usage or no
known price for the model `cost unknown` — never 0 or `$0` (SAFE-16). Anyone
else's footer SHALL show the model and the time (and the plumbing) and never
tokens or an amount; the live thinking status SHALL show token use only on the
owner's own runs. The embed SHALL be colored like the done or error status the
fallback would show. A Choose stub (the edit that carries buttons) SHALL carry
no embed (DISCORD-ASK-6, REQ-discord-047). A reply fallback (no editable
thinking message) SHALL carry the same footer on the answer's last message
(REQ-discord-075). A later re-edit SHALL keep the first footer, time included.
The answer body SHALL remain human text only.

Acceptance Criteria
- Mention answer collapsed into the thinking message: `content` is the summary and `embed` is `{ color, footer: { text: "<model> | <time> | state=… verified=… [verifySkipped] attempts=…" } }` with no description; no `✅ Done` embed edit.
- Button pick: the Choose stub edit has `embed: null`; the answer of the run the pick resumed, edited into that stub, carries the footer-only embed.
- `/session start` and `/work` collapsed answers carry the same footer-only embed; the body never contains `state=` or `attempts=`.
- Color: success unless the fallback would mark the status failed (a failed run without a question, or a stuck ask), then error.
- A later re-edit of the collapsed answer (SAFE-8 owner notice appended) keeps the same footer (same time) and color.
- With neither a model nor plumbing known the answer's footer is the time; the fallback without `editMessage` keeps its done/error status embed and its reply carries the answer footer on the last message.
- The owner's run with provider usage shows `<model> | <tokens> tokens | $<cost> | <time>`; with no usage `tokens unknown | cost unknown`; an unpriced model `cost unknown`; never `$0`.
- A run by anyone but the owner shows `<model> | <time>` (plus plumbing) and never `token` or `$`; its live status never shows `tok`, the owner's does.
- No new env vars, config keys, slash commands or schema changes.
- A run that failed over shows `<answered> (fell back from <failed>)` as the model, for everyone; the owner's cost sums each model's own price (REQ-discord-080).
