---
change: workreviewapplies-passes-cwd-into-actingworktask-after-agent-1-nongit
artifact: context
---

# Context

After #351 (AGENT-1 nongit) landed on a tip that already had #365
(GITHUB-9), `bunx tsc --noEmit` failed on main:

`src/cli.ts`: `actingWorkTask(env)` — Expected 2 arguments, but got 1.

#351 changed `actingWorkTask` to `(env, cwd)` so the /work bit is git-only
(`truthy(env) && isGitRepo(cwd)`). #365's `workReviewApplies` still called
the one-arg form. Tip-orphan #378 for the #351 SpecSync archive cannot land
until smoke (tsc) is green, so this call-site fix rides with that orphan.
