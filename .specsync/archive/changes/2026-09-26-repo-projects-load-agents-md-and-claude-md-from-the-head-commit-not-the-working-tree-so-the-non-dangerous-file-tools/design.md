---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: design
---

# Design

All logic stays in `src/agent/project-instructions.ts`; `execute.ts` is
untouched.

`loadProjectInstructions(cwd)` still finds the root as the nearest `.git` at
or above cwd (else cwd). Then:

- **No `.git`** (`source: "working-tree"`): unchanged working-tree reader
  (realpath clamp, O_NOFOLLOW, /proc fd check, regular files only).
- **`.git` present** (`source: "commit"`): read from `HEAD` only.
  1. `git rev-parse --show-toplevel` must equal the real root, else every
     present instruction file is refused ("committed copy unreadable (not a
     usable git repository)"). No working-tree fallback: that path is the one
     the file tools can write without consent.
  2. `git ls-tree -z -l --full-tree HEAD -- AGENTS.md CLAUDE.md` gives mode,
     oid and size. Unborn HEAD (`rev-parse -q --verify HEAD` fails) is an
     empty tree.
  3. A name missing from HEAD but present on disk is refused with
     `NOT_COMMITTED_REASON`.
  4. Symlink entries (mode 120000): the blob is the target text; it is
     normalised relative to the link's tree directory and looked up again
     with `ls-tree` (max 8 hops). Absolute targets outside the root and
     `..` escapes are refused ("resolves outside the project root"); a
     target not in the tree (including a hop through a symlinked directory,
     which `ls-tree` never follows) is "broken symlink"; loops end as "too
     many symlink hops"; trees / submodules are "not a regular file". Only
     paths inside the commit are ever read.
  5. Blob bytes come from `git cat-file blob <oid>` (runs no filters) with
     `maxBuffer = cap + 1`, so a huge blob is cut off; the shared
     `decodeInstruction` applies the UTF-8-safe cut, truncation marker,
     binary / non-UTF-8 refusal and SAFE-6 scrub used by both modes.
  6. Duplicates are keyed by the final tree path (CLAUDE.md -> AGENTS.md).
  7. `git diff --name-only -z --no-ext-diff --no-textconv --no-renames HEAD
     -- <names and resolved targets>` marks loaded files whose working-tree
     copy differs (`uncommitted: true`).

Git runs through `Bun.spawnSync` (argv array, no shell, stdin ignored, 10 s
timeout) with `-c core.hooksPath=/dev/null -c core.fsmonitor=false` and the
git plugins' `gitEnv(root)` (strips GIT_DIR / GIT_WORK_TREE / ... and sets
GIT_CEILING_DIRECTORIES to the root's parent, so no repo above the root is
used). Any spawn failure is caught; the loader still never throws.

Note: `projectInstructionsWarning` now also speaks up for `uncommitted`
files; `describeProjectInstructions` renders them as
`AGENTS.md (N bytes, committed copy; working-tree changes not loaded)`.

Residual risk: a project folder without `.git` still reads the working tree,
so files-write can plant AGENTS.md there for the next CLI run of that
operator. Discord session worktrees and WATCH project roots are git repos.
Closing that needs the SAFE-2 extension (HI capture) or ROLES-CHAT-2/3/5.
