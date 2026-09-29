---
change: condense-long-chats-at-about-80-of-the-model-s-window-with-the-task-and-latest-instruction-pinned-resume-from-the
artifact: docs
---

# Docs

- `docs/discord.md` (Session replies): the session thread paragraph (human
  turns whole up to 8000, answers 1500), a "Long chats are condensed"
  paragraph (80% of `CORVIDINHO_LLM_CONTEXT_TOKENS`, default 8192, task and
  latest instruction word for word, extractive points, 32000-char ceiling,
  stored with the session, restart / other model) and a "Kept 30 days,
  resumed after the TTL" paragraph (reply or thread message, gates, own user
  only, same project, 30 days from the last activity, purge, forget).
- `docs/WATCH.md`: thread conversation bullet (REQ-watch-472).
- `docs/DISCORD-GO-LIVE.md` and `.env.example`: the optional
  `CORVIDINHO_LLM_CONTEXT_TOKENS`.
- `docs/BOX-UPDATE.md`: schema v12 and the kept conversations in
  `corvidinho.db`.
- `STATUS.md`: the remaining-gaps line no longer says long threads are
  elided and WATCH carries only the newest event.
- `specs/discord/discord.spec.md` (Public API, Invariants, Error Cases,
  `files:`), `specs/discord/testing.md`, `specs/watch/watch.spec.md`
  (Public API, Invariants, Behavioral Examples, Error Cases, `files:`),
  `specs/watch/testing.md`.
- No slash command, CLI flag or config key; one optional env var.
