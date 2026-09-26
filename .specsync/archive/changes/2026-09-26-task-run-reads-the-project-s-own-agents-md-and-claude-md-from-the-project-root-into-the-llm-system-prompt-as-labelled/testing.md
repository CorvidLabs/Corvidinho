---
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
artifact: testing
---

# Testing

`tests/agent.project-instructions.test.ts` (temp dirs, mocked fetch, no
network):

- root = nearest `.git` dir or `.git` file; a parent AGENTS.md outside the
  project is never read; no `.git` -> cwd is the project.
- AGENTS.md + CLAUDE.md loaded and labelled; missing files skipped.
- >16 KiB file cut with the truncation marker; UTF-8 boundary kept.
- symlink outside, symlinked dir hop outside, broken symlink, directory,
  binary and non-UTF-8 files refused; in-project symlink followed;
  CLAUDE.md -> AGENTS.md reported as duplicate and rendered once.
- secret in AGENTS.md scrubbed; closing label escaped.
- `createTaskExecute`: read and tool tiers carry the block on every attempt,
  a clean load emits no event; a truncated AGENTS.md plus an outside
  CLAUDE.md symlink emit exactly one note across two attempts;
  `projectInstructionsWarning` is null for a clean load (incl. duplicate);
  `projectInstructions: false` and no files leave the
  prompt unchanged.

Plus `bun test`, `bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.
