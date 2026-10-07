---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: context
---

# Context

- Issue #72 (SESSION-5, M2 Talk anywhere). #296 shipped condensing with six
  design choices pending Leif; the v0.0.35 rollup on #72 listed the gap:
  one operator window (`CORVIDINHO_LLM_CONTEXT_TOKENS`, default 8192) for
  every model; a 32,000-character ceiling because the prompt went to the
  agent as one `--task` argument (Linux caps one argument at 128 KiB); only
  the conversation part counted toward the 80%; an extractive summary (first
  160 characters per folded turn, no model call); nothing condensed inside a
  run's tool loop.
- Leif's 2026-09-28 interview, round 16 (2026-10-06): "SESSION-5 (#72):
  per-model windows + model-written summary — each configured model has its
  own context window; at 80% of it a model writes the summary; the pinned
  task and latest instruction stay word for word." Captured in this PR as
  SESSION-5.a with `hi` (`hi/session.md`), exact text.
- Model calls and the SAFE-8 spend guard live in the `task run` child, as do
  the system prompt, tools, persona and project instructions; the bridge
  only knows the conversation and the memory / identity blocks. So the
  condensing moves into the run, and the bridge keeps what it reports.
- AGENT-13 entries (`kind:model`) are parsed by `parseModelEntry` in every
  model key (#370 added `CORVIDINHO_LLM_MODEL_ORDER` in the same format);
  AUTONOMY-8.a (#371) reserves a worst-case reply before every call.
- An earlier aborted attempt left a stale worktree; this change was built
  fresh from origin/main 54d6a6c7.
