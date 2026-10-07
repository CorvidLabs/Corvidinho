---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: plan
---

# Plan

1. `src/watch/types.ts`: `textEditorIds`, `threadAuthorId`.
2. `src/watch/searcher.ts`: `nodeId` / `updatedAt` from REST,
   `findTextEditors` (GraphQL `TEXT_EDITORS_QUERY`,
   `textEditorIdsFromNode`), fixture fields; `fetchWatchEvents` fills both.
3. `src/watch/router.ts`: `textUneditedByOthers`; `watchTriggerRole`,
   the role line and `watchInjectionVerdict` use it and `threadAuthorId`.
4. `src/plugins/roles.ts` + `src/plugins/run.ts`: `WATCH_CHECKOUT_WRITE_TOOLS`
   refused on WATCH. `src/audit/log.ts`: GitHub actor.
5. `tests/watch.github-roles.postreview.test.ts`; update the four tests that
   built events without edit info or expected `local`; fail-on-base proof
   (main's `src/` swapped in, then per file).
6. Docs (WATCH.md, discord.md, DISCORD-GO-LIVE.md), spec prose, deltas,
   module testing evidence.
7. `specsync change approve` → `change check --commit` → `change audit` →
   `specsync check --require-coverage 100` → `hi check` →
   `bunx tsc --noEmit` → `bun test` (twice) →
   `fledge lanes run verify --non-interactive`.
