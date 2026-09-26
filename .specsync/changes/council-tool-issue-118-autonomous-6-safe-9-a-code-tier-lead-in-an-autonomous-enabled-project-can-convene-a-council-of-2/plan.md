---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: plan
---

# Plan

1. Council core in `src/autonomous/council.ts`: args, voice tier, lenses,
   prompts per phase, and `runCouncil` with bounded concurrency, caps and
   time limits.
2. `DelegateChildOutcome.resultText` in the delegate core (additive).
3. `council` plugin in `plugins/autonomous/council.ts`, registered by
   `loadAutonomousPlugins`, with gates re-checked in the handler; only a
   top-level lead (depth 0) may convene, a delegated worker is refused.
4. Tests: an in-process fake runner for the core; a `.ts` fake bin for the
   plugin and the lead tool loop.
5. Specs: REQ-agent-118 and REQ-plugins-118 (canonical and deltas), spec file
   lists, testing and context notes; the fledge.toml comment.
6. Verify: `specsync check --require-coverage 100`, `bunx tsc --noEmit`,
   `bun test`, `fledge lanes run verify --non-interactive`.
