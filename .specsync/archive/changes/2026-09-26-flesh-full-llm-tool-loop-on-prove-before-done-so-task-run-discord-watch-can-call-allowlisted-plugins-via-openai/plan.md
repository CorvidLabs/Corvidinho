---
change: flesh-full-llm-tool-loop-on-prove-before-done-so-task-run-discord-watch-can-call-allowlisted-plugins-via-openai
artifact: plan
---

# Plan

1. Add tier + tools modules; extend types/events.
2. Flesh execute tool loop; keep demo stub when no key.
3. CLI --tier + event logging; .env.example + STATUS.
4. Fixture tests (mock HTTP): tool round-trip, read tier, SAFE-1 deny, abort, filesChanged.
5. SpecSync deltas + verify; PR; squash-merge; close #31.
