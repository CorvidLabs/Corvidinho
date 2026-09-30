---
change: scheduled-runs-read-and-act-only-on-repos-the-owner-allowlists-even-public-ones-discord-schedule-3-a-in-a-schedule-run
artifact: plan
---

# Plan

1. Map every path a scheduled run has to a remote repo (research).
2. Marker in `src/plugins/roles.ts`; scheduler session id from the constant.
3. Schedule-run step in `checkRepoGateForActingRole`.
4. Per-hop GitHub rule in `plugins/web/fetch.ts`; env passed by the handler.
5. `resolveProjectDir` `schedule` option; `/schedule create` and the tick
   pass it.
6. Tests: `tests/github.schedule-repo-gate.test.ts`, nested-checkout cases
   in `tests/worktree.project-scope.test.ts`; give existing nested schedule
   projects an allowlisted origin; prove the new tests fail on base.
7. Docs (`docs/discord.md` with the upgrade note, `docs/DISCORD-GO-LIVE.md`,
   `docs/WATCH.md`), spec prose, scenarios, error cases, files list, testing
   notes, deltas.
8. Approve, `change check --commit`, audit, coverage, `hi check`, tsc,
   `bun test`, fledge verify.
