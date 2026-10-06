---
change: on-github-the-owner-and-team-i-ve-declared-get-their-role-s-tools-behind-the-must-ask-gate-strangers-stay-community
artifact: plan
---

# Plan

1. `hi IDENTITY-12.a "<Leif's text>"` (own commit); `hi check`.
2. `src/plugins/roles.ts`: `isWatchRunEnv`; `watchTriggerRoleNow` (GitHub id
   in the people list, deny / mute, never throws); `resolveActingIsAdmin` and
   `resolveActingRole` take the GitHub path on a WATCH run and never the
   Discord one; `actingWorkTask` false on WATCH.
3. `src/watch/router.ts`: `watchTriggerRole(event, people)`; role line in
   `formatWatchIdentityBlock`. `src/watch/poller.ts`: pass `actingRole`.
   `src/watch/agent-client.ts`: stamp `IS_ADMIN` / `ROLE` / `WORK_TASK=0`.
4. `plugins/files/protectedPaths.ts`: `secretPathsRefused` true on WATCH.
   `src/agent/execute.ts`: no Fledge plugin discovery in a WATCH run.
5. `tests/watch.github-roles.test.ts` and the WATCH-owner Fledge case in
   `tests/agent.allowlisted-dangerous.test.ts`; update the two tests that
   asserted the old behaviour; fail-on-base proof (swap e1a24ed's changed
   sources in, run, restore, run).
6. Docs (docs/WATCH.md "Roles on GitHub", docs/discord.md roles + must-ask,
   docs/DISCORD-GO-LIVE.md), spec prose, deltas, module testing evidence.
7. `specsync change approve` → `specsync change check --commit` →
   `specsync change audit` → `specsync check --require-coverage 100` →
   `hi check` → `bunx tsc --noEmit` → `bun test` →
   `fledge lanes run verify --non-interactive`.
