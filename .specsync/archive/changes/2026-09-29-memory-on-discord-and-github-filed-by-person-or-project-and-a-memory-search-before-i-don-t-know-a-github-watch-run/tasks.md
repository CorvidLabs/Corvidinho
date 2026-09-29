---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: tasks
---

# Tasks

- [x] Capture MEMORY-8 / MEMORY-9 (hi/memory.md) with `hi` from Leif's 2026-09-28 interview (one commit); `hi check` green.
- [x] Re-verify the gap on the stacked base 9270d81: GitHub runs clear the actor so memory refuses; `--query` is one `LIKE` substring; the inject is the newest 20; no search before "I don't know".
- [x] `src/memory`: `rank.ts` (terms, stem, `rankMemories`, `recallRelevantThenRecent`); ranked `MemoryStore.recall` with a query (no schema change); `memorySubjectForGithub`, `projectScopeForRepo`; exports.
- [x] `plugins/memory`: the GitHub commenter from env; declared = own profile; undeclared = project read-only, nothing saved; GitHub refusals (project write, `--person`, private notes, forget-me); descriptions.
- [x] WATCH: spawn stamps `CORVIDINHO_ACTING_GITHUB_*` and clears the Discord reply keys; `src/watch/memory-inject.ts`; poller searches memory for the comment and passes the commenter.
- [x] Discord: the spawn clears the GitHub keys; the chat / button inject searches memory for the message.
- [x] Agent: MEMORY-9 and (i) GitHub prompt rules; `src/agent/recall-guard.ts` and the loop check (search only when nothing searched, a model call only on a hit, once per attempt).
- [x] Tests: `tests/memory.recall-github.test.ts` (16, base APIs only) and `tests/memory.rank.test.ts` (15); fail on the base sources (12 of 16 fail — four guards hold on base by design — and the helper file does not load), pass on the branch.
- [x] Docs: `docs/WATCH.md`, `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`, `STATUS.md`; spec prose and `files:` (`watch`, `plugins`, `discord`, `agent`), `specs/*/testing.md`; deltas Added REQ-watch-067 / REQ-plugins-067 / REQ-agent-067 / REQ-discord-067, Modified REQ-watch-008 (REQ-plugins-101, added by #101's still-active change, is left to REQ-plugins-067's stated exception).
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
