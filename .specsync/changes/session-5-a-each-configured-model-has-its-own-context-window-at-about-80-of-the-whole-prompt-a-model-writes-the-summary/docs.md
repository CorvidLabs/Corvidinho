---
change: session-5-a-each-configured-model-has-its-own-context-window-at-about-80-of-the-whole-prompt-a-model-writes-the-summary
artifact: docs
---

# Docs

- `docs/discord.md`: the "Long chats are condensed" paragraph (per-model
  window, whole prompt, model-written summary, fallback, stdin).
- `docs/WATCH.md`: thread conversation bullet.
- `docs/DISCORD-GO-LIVE.md`: env block (`=TOKENS`, fallback key).
- `.env.example`: context-window block.
- `src/cli.ts` `--help`: `--task-stdin`, `=TOKENS`, `CORVIDINHO_LLM_CONTEXT_TOKENS`.
- `STATUS.md`: SESSION-5.a row and the #31 gap line; `CHANGELOG.md`:
  Unreleased bullet (no version section, no package bump).
- Specs: `agent.spec.md` (files, Purpose, Public API, Invariants, Examples,
  Errors), `cli.spec.md`, `discord.spec.md`, `watch.spec.md`, and each
  module's `testing.md`.
