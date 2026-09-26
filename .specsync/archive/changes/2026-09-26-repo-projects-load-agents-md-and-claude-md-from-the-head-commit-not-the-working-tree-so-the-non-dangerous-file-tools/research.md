---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: research
---

# Research

- `plugins/files/commands.ts`: files-write / files-edit are
  `dangerous: false`, `minTier: 2`; `plugins/files/protectedPaths.ts` covers
  `.git`, `.env*`, `specs`, `fledge.toml`, `*.spec.md`, keystores only.
- `plugins/git/commands.ts`: git-commit, git-branch-create and git-push are
  `dangerous: true` (SAFE-1), so HEAD moves only with consent.
- `plugins/git/exec.ts` `gitEnv(root)` already strips repo-locating env and
  clamps discovery with GIT_CEILING_DIRECTORIES; reused as is.
- `git ls-tree -l` gives mode, oid and size in one call and does not descend
  through a symlinked directory (a path through one returns nothing).
- `git cat-file blob` prints raw blob bytes (no textconv / smudge).
- `Bun.spawnSync` with `maxBuffer` stops the child and keeps at least
  `maxBuffer` bytes (`exitedDueToMaxBuffer: true`); checked on Bun 1.4.2.
- Unborn HEAD: `ls-tree HEAD` exits 128 and `rev-parse -q --verify HEAD`
  exits 1.
