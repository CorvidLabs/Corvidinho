---
change: tool-loop-dispatches-only-tools-offered-in-the-run-s-catalog-safe-1-agent-5-pr-128-review-follow-up-a-registered-but
artifact: plan
---

# Plan

1. Guard dispatch in `src/agent/execute.ts`.
2. Fixture test: model calls `danger-ping` (registered, dangerous, not offered)
   in interactive mode with it allowlisted → refused.
3. Update memory store fixture for soft-deleted re-store (companion change).
4. Spec delta REQ-agent-128; SpecSync check; fledge verify.
