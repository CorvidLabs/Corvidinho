---
change: open-discord-asks-are-secret-scrubbed-before-the-session-row-is-saved-and-the-safe-6-re-scrub-rewrites-stored-open-asks
artifact: tasks
---

# Tasks

- [x] Reproduce raw open-ask secrets in `discord_sessions.pending_ask` on main and a re-scrub that leaves them
- [x] Scrub question and option labels in `pendingAskBody` (session-store.ts)
- [x] JSON-aware re-scrub of `pending_ask` (`scrubJsonText`, `SCRUB_TARGETS` json columns, `jsonUnparsed`, content-free log) and `SCRUB_RULES_VERSION` 3 (scrub.ts)
- [x] Regression tests (fail on main, pass on branch)
- [x] docs/discord.md, discord.spec.md prose + scenario, requirements.md, testing.md
- [x] REQ-discord-066 delta (Modified)
- [x] specsync check, tsc, bun test, fledge verify
