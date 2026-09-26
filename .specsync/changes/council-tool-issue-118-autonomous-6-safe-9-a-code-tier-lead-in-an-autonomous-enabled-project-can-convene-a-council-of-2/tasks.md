---
change: council-tool-issue-118-autonomous-6-safe-9-a-code-tier-lead-in-an-autonomous-enabled-project-can-convene-a-council-of-2
artifact: tasks
---

# Tasks

- [x] Council core: args parse, voice tier clamp, lenses, phase prompts, capped and scrubbed entries
- [x] `runCouncil`: propose, critique, decide; at most 2 voices at once; per-voice and council time caps; lead abort
- [x] Delegate core: additive `resultText` on `DelegateChildOutcome`
- [x] `council` plugin (dangerous=false, mutating=true, minTier=2, autonomous=true) with run-time gate re-checks and a council budget
- [x] Register `council` in `loadAutonomousPlugins`
- [x] Document `council` in the fledge.toml autonomous comment
- [x] Tests: in-process runner for the core; `.ts` fake bin for plugin argv/env, refusals, clamp, failed chair, time cap, limiter, ROLES-CHAT refusal and the tool loop
- [x] Spec deltas and canonical spec updates (REQ-agent-118, REQ-plugins-118)
- [x] Verify: specsync check --require-coverage 100, tsc, bun test, fledge verify lane
