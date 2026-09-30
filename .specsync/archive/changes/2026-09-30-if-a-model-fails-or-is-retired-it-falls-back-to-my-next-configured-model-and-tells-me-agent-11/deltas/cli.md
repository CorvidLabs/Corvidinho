---
module: cli
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
---

# Delta: cli (task run reports the model that answered and every failover; the daemon logs llm.fallback — AGENT-11)

## Added

### REQUIREMENT REQ-cli-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the chain is REQ-agent-080). `task run` SHALL put the configured
model that answered on `TaskResult.model`, the usage per configured model on
`TaskResult.usageByModel` and every failover (its own and, marked `via`, its
delegate or council workers') on `TaskResult.modelFallback`, in `--json` and
the NDJSON `result` frame (optional fields, protocol 2 unchanged); every NDJSON
`usage` frame SHALL name its `model` and the running `byModel` totals. Each
failover SHALL be an `[operator] <a> failed (<reason>); falling back to <b>`
line on stderr in text mode (a `Text` frame in ndjson, quiet stderr in json),
and the printed answer SHALL end with the closing `(model fallback: …)` note.
The daemon's own spawn client SHALL log each schedule run that failed over as a
`warn` `llm.fallback` event with `sessionId`, `fallbacks` (`from`, `to`,
`reason`, optional `via`) and a `message` line (`formatModelFallbackLog`);
there is no DM, and the run's post carries the note. No flag or env var is
added. `.env.example`, `docs/DISCORD-GO-LIVE.md`, `docs/DAEMON.md`,
`docs/WATCH.md`, `docs/discord.md` and `README.md` SHALL describe the list as
a fallback chain and no longer say that only its first entry is called.

Acceptance Criteria
- `task run --output ndjson` with `ollama:gone-model, ollama:fake-model` against a localhost provider answering `gone-model` 404: exit 0; a Text frame `[operator] ollama:gone-model failed (HTTP 404); falling back to ollama:fake-model`; a usage frame with `model` `ollama:fake-model` and `byModel`; a `done` result whose summary ends with the note and that carries `model`, `usageByModel` and `modelFallback`.
- `task run` (text) with a 410 head: exit 0, the operator line on stderr, the answer followed by the note on stdout.
- A daemon started without an injected agent, `CORVIDINHO_BIN` a fake bin whose result frame reports a failover: after a due schedule runs, one `llm.fallback` warn event with the schedule's session id, the hops and `llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1`.
- `tests/docs.operator-facts.test.ts` still passes with the new Logs row.
