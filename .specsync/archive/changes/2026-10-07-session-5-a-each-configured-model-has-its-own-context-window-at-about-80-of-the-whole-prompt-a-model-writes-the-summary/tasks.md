---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: tasks
---

# Tasks

- [x] Capture SESSION-5.a with `hi` (exact confirmed text) in its own commit.
- [x] Per-model window `kind:model=TOKENS` (`parseModelEntry`, `modelWindowTokens`); fallback unchanged.
- [x] Remove the 32,000-char ceiling; `task run --task-stdin` transport; Discord + WATCH clients use it for conversation runs.
- [x] Run-side condenser: whole prompt, current model's window, model-written summary through the spend guard, extractive fallback with operator / bridge log lines.
- [x] Bridges keep the report with the session / thread (SESSION-6, SESSION-3.a).
- [x] Tests: per-model window, whole-prompt trigger, model summary, pinned verbatim, fallback, spend, stdin transport, clients, store, bridge, WATCH; fail-on-base proof.
- [x] Specs, deltas (REQ-agent-473, REQ-cli-473, REQ-discord-472, REQ-watch-472), docs, STATUS, CHANGELOG.
- [x] SpecSync approve / check / audit, coverage 100, `hi check`, `tsc`, `bun test`, verify lane.
