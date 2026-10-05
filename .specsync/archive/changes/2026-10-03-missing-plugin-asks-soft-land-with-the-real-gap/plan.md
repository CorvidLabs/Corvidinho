---
change: missing-plugin-asks-soft-land-with-the-real-gap
artifact: plan
---

# Plan

1. Classifier and reply formatter with injected lookup and Fledge probe.
2. Hook it in `createTaskExecute` before the model, and on vague install asks and unseen tool names.
3. One sentence in the ask-human instructions.
4. Bun tests in `tests/agent.missing-capability.test.ts`.
5. Agent spec owns the new file (REQ-agent-742). No new HI capture.
