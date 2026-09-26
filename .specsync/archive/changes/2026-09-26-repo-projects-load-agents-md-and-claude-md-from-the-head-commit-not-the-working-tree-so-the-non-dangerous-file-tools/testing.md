---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: testing
---

# Testing

`tests/agent.project-instructions.test.ts` (temp dirs, local `git init`
fixtures, mocked fetch, no network):

Git project (HEAD):

- committed AGENTS.md + CLAUDE.md loaded from a subdirectory cwd; parent
  AGENTS.md never read; `source: "commit"`; no note.
- review PoC: files-write overwrites AGENTS.md and adds CLAUDE.md; the
  committed text is loaded with `uncommitted: true`, CLAUDE.md is refused as
  not committed, the planted text never renders, the note names both; after
  a commit the new text loads with no note.
- a working-tree edit to a committed symlink's target is flagged.
- unborn HEAD: untracked AGENTS.md refused; empty `.git` dir: present
  AGENTS.md refused, no working-tree fallback.
- `git worktree add` session worktree reads its own HEAD.
- committed symlinks: CLAUDE.md -> AGENTS.md duplicate; in-tree link
  followed; `../` and absolute outside refused; broken, symlinked-dir hop
  and loop refused; a directory is not a regular file.
- 256 KiB blob cut at 16 KiB with the marker (blob read stopped early);
  binary and non-UTF-8 blobs refused; secret scrubbed.
- `createTaskExecute`: read and tool tiers carry the committed file; a
  planted working-tree AGENTS.md never reaches either attempt's prompt and
  yields exactly one note.

Plain folder (no `.git`, working tree): the existing cap, UTF-8 cut,
symlink, binary, scrub, label-escape and warning tests, unchanged.

Plus `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage
100`, `fledge lanes run verify --non-interactive`.
