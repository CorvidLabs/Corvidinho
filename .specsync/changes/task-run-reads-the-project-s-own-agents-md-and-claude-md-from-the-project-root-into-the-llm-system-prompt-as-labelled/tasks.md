---
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
artifact: tasks
---

# Tasks

- [x] Add `src/agent/project-instructions.ts` with root finder, guarded
      reader (cap, symlink, binary, UTF-8), renderer and note.
- [x] Hook read-tier and tool-loop system prompts in `createTaskExecute`.
- [x] Emit a one-time `Text` note only when a file is refused or truncated.
- [x] Export the module from `src/agent/index.ts`.
- [x] Temp-dir fixture tests.
- [x] Spec files list, Public API, Invariants, Error Cases; delta REQ-agent-084.
