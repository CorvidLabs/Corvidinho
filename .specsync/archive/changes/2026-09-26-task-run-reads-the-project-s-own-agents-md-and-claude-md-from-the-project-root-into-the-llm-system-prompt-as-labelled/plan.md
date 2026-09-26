---
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
artifact: plan
---

# Plan

1. Add `src/agent/project-instructions.ts` (root finder, guarded reader,
   renderer, note).
2. Hook it into `createTaskExecute` for the read tier and the tool loop, plus
   a one-time `Text` note.
3. Export from `src/agent/index.ts`.
4. Temp-dir fixture tests in `tests/agent.project-instructions.test.ts`.
5. Spec: files list + Public API / Invariants / Error Cases in
   `specs/agent/agent.spec.md`; delta REQ-agent-084.
