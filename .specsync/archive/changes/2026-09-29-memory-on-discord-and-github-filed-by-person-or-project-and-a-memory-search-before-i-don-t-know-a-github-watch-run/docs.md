---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: docs
---

# Docs

- `docs/WATCH.md`: "What a WATCH run can do" — memory acts for the
  commenter's declared person; undeclared = the repo's project memory
  read-only; GitHub refusals; the pre-run memory search and its log line
  (replaces "memory plugins refuse").
- `docs/discord.md` Memory: MEMORY-1..9; project memory note for GitHub;
  new bullets "On GitHub (MEMORY-8)" and "Search before 'I don't know'
  (MEMORY-9)" (ranked `--query`, the inject search, the loop guard).
- `docs/DISCORD-GO-LIVE.md` E.6 community catalog: GitHub WATCH memory scope.
- `STATUS.md`: the #41 / #59 memory row mentions #67.
- Specs: `specs/watch/watch.spec.md` (purpose, Public API, `files:` +
  `src/watch/memory-inject.ts`), `specs/plugins/plugins.spec.md` (memory
  prose, `files:` + the GitHub test), `specs/discord/discord.spec.md`
  (memory invariant, `files:` + `src/memory/rank.ts` and the rank test),
  `specs/agent/agent.spec.md` (prompt + guard, `files:` +
  `src/agent/recall-guard.ts`), `specs/*/testing.md`.
- No new user config key or slash command. The `CORVIDINHO_ACTING_GITHUB_*`
  keys are internal spawn env (like `CORVIDINHO_ACTING_DISCORD_USER_ID`),
  set by the WATCH spawn and cleared by the Discord spawn.
