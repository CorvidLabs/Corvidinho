---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: requirements
---

# Requirements

- **SESSION-5.a** (hi/session.md, captured in this PR): "Each model I
  configure has its own context window; at about 80% of it, a model writes
  the summary of older turns, and the current task and my latest
  instructions stay word for word."
- **SESSION-5** (on main): "At about 80% of the model's window, older turns
  are condensed into a summary; the current task and its latest
  instructions stay pinned word for word."
- **SESSION-6** / **SESSION-3.a** (on main): the summary is saved with the
  session and a resume picks up from it.
- **AUTONOMY-8 / 8.a**, **SAFE-8**: the summary call counts toward the spend
  caps and reserves its worst-case reply.
- **SAFE-6 / SAFE-12**: summaries scrubbed; replayed text and summaries are
  data (fenced when they hold untrusted text).
- New: **REQ-agent-473** (the run condenses against the whole prompt and the
  current model's own window; a model writes the summary; extractive
  fallback), **REQ-cli-473** (`task run --task-stdin`). Modified:
  **REQ-discord-072** (the replay block is whole: no 32000-char safety net,
  a model-written summary, `--task-stdin`), **REQ-discord-472** (the bridge
  replays whole, hands the run the conversation and keeps its report),
  **REQ-watch-472** (the same on WATCH).
