---
change: planning-picks-spec-modules-from-the-request-not-the-bridge-wrapper-and-the-briefing-fence-and-cap-are-hardened
artifact: plan
---

# Plan

1. Add `planningSelectionText` and use it for selection in `loadRelevantSpecs`.
2. Harden the fence escape and the surrogate-safe cut in `renderSpecBriefing`.
3. Regression tests in `tests/agent.execute.test.ts` and
   `tests/specLoader.test.ts`; show they fail on the PR #202 source.
4. Modify REQ-agent-004 through the delta; note it in the agent Invariants.
5. `specsync check`, `bun test`, `fledge lanes run verify --non-interactive`.
