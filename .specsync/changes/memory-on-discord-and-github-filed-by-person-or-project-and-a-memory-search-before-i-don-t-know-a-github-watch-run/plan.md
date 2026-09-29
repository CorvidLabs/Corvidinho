---
change: memory-on-discord-and-github-filed-by-person-or-project-and-a-memory-search-before-i-don-t-know-a-github-watch-run
artifact: plan
---

# Plan

1. Worktree on the #101 head (9270d81); capture MEMORY-8 / MEMORY-9 with
   `hi` (one commit); `hi check`; `specsync change new`.
2. `src/memory`: `rank.ts` (terms, stem, `rankMemories`,
   `recallRelevantThenRecent`); ranked `MemoryStore.recall` with a query;
   `scope.ts` `memorySubjectForGithub`, `projectScopeForRepo`; exports.
3. `plugins/memory`: GitHub commenter from env; declared = own profile;
   undeclared = project read-only; GitHub refusals (project write, `--person`,
   private, forget-me); descriptions.
4. WATCH: spawn env (`CORVIDINHO_ACTING_GITHUB_*`, Discord reply keys
   cleared); `src/watch/memory-inject.ts`; poller wiring.
5. Discord: spawn clears GitHub keys; chat / button inject searches for the
   message.
6. Agent: prompt rules (MEMORY-9, (i) GitHub); `src/agent/recall-guard.ts`
   and the loop check.
7. Tests `tests/memory.recall-github.test.ts` (base APIs only) and
   `tests/memory.rank.test.ts`; prove fail on base, pass on branch.
8. Docs (`docs/WATCH.md`, `docs/discord.md`, `docs/DISCORD-GO-LIVE.md`,
   `STATUS.md`); spec prose, `files:`, `specs/*/testing.md`; deltas.
9. `specsync change approve`, `change check --commit`, `change audit`,
   `specsync check --require-coverage 100`, `hi check`, `bunx tsc
   --noEmit`, `bun test`, `fledge lanes run verify --non-interactive`.
