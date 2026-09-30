---
module: watch
change: if-a-model-fails-or-is-retired-it-falls-back-to-my-next-configured-model-and-tells-me-agent-11
---

# Delta: watch (a WATCH run that failed over is a warn line; its comment keeps the note — AGENT-11)

## Added

### REQUIREMENT REQ-watch-080

If a model fails or is retired, it falls back to my next configured model and
tells me (AGENT-11, captured in `hi/agent.md` from Leif's 2026-09-28
interview; the chain is REQ-agent-080). The WATCH spawn client SHALL read the
result frame's `modelFallback` (`modelFallbackFromUnknown`, validated) and,
when a run failed over, call its `onModelFallback(hops, sessionId)` option, by
default one warn line `[watch] llm.fallback: <a> failed (<reason>), fell back
to <b>[; …] (session <id>)` (`warnWatchModelFallback`) — how the owner hears of
a failover in a commenter's run, besides the note; no DM. The run summary
comment SHALL keep the run's closing `(model fallback: …)` note when its 1800
cap clips a long summary (`chatBodyFromTaskResult`, REQ-agent-080). No env var
or config key is added.

Acceptance Criteria
- A fake bin whose result frame reports `gpt-5` → `gpt-4.1` (HTTP 404): the WATCH client's summary ends with the note and `[watch] llm.fallback: gpt-5 failed (HTTP 404), fell back to gpt-4.1 (session w1)` is logged as a warning.
