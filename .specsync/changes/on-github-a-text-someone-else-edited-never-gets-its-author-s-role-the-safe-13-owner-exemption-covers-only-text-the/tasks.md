---
change: on-github-a-text-someone-else-edited-never-gets-its-author-s-role-the-safe-13-owner-exemption-covers-only-text-the
artifact: tasks
---

# Tasks

- [x] Edit info on WATCH events (`textEditorIds`, `threadAuthorId`) from REST + GraphQL; fixture fields.
- [x] `watchTriggerRole` / role line / SAFE-13 use `textUneditedByOthers`; the title is exempt only on an owner-opened thread.
- [x] `runPlugin` refuses `WATCH_CHECKOUT_WRITE_TOOLS` on WATCH for every role.
- [x] `auditContextFromEnv` names the GitHub trigger on WATCH.
- [x] `tests/watch.github-roles.postreview.test.ts` (12 tests); fail-on-base proof (11 of 12 fail; per file).
- [x] Update `tests/watch.github-roles.test.ts`, `tests/safe.injection.test.ts`, `tests/identity.recognise.test.ts`, `tests/audit.log.test.ts`.
- [x] docs/WATCH.md, docs/discord.md, docs/DISCORD-GO-LIVE.md; spec prose, requirements, deltas, testing evidence.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
- [x] Review round: always read edits from GraphQL (no `updated_at` shortcut), once per new event (`needsLookup`).
- [x] Review round: `titleEditorIds` / `titleUnrenamedByOthers`; the owner's title is exempt only while nobody else renamed it.
- [x] Review round: `watchActingGithub` for `runChat` and the memory inject; `edited` forget-me outcome.
- [x] Review round: 8 more tests (fail on main and on the pre-review head); updated `tests/watch.github-numeric-id.test.ts`, `tests/memory.recall-github.test.ts`, `tests/watch.forget-me.test.ts`; docs, deltas (REQ-watch-067 / 1016 modified), spec prose and testing evidence.
