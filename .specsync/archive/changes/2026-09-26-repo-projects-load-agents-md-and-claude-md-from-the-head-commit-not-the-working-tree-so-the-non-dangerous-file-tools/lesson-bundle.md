# Lesson bundle — repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Repo projects load AGENTS.md and CLAUDE.md from the HEAD commit, not the working tree, so the non-dangerous file tools cannot plant system-prompt instructions for later runs (AGENT-1 hardening, issue #84, review of PR #150)
- **Kind**: BugFix
- **Specs**: agent
- **Paths**: src/agent/project-instructions.ts, src/agent/index.ts, tests/agent.project-instructions.test.ts
- **Acceptance**: In a project root that holds .git, task run loads AGENTS.md / CLAUDE.md only from the HEAD commit: a working-tree overwrite by files-write never reaches the system prompt (the committed copy is loaded and the run note says working-tree changes were not loaded); an instruction file that exists only in the working tree (untracked, or unborn HEAD) is refused as not committed; a .git that git cannot use refuses present files instead of falling back to the working tree; committed symlinks are followed only inside the commit (outside, broken, directory-hop and looping links refused); cap/UTF-8/binary/scrub rules unchanged; a plain folder with no .git still reads the working tree; local git fixture tests

## Evidence

- Verification commit: `db15130045af13e3d56c172271e7bcf9f40eb4c6`
- Base commit: `6e7cbd5d8511c765824f70f11b59b5e2d7da36b5`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

PR #150 (issue #84, AGENT-1, REQ-agent-084) made `task run` load the
project's AGENTS.md / CLAUDE.md into the system prompt under a header that
says "Follow them". It read the working-tree copy.

Review of #150 (major finding) showed that the agent can write those files
itself: `files-write` / `files-edit` are `dangerous: false`, minTier 2 (code
tier), and SAFE-2's `isProtectedPath` does not cover AGENTS.md or CLAUDE.md.
Any text that steers one code-tier run (Discord task text, a GitHub issue body
in WATCH, fetched content) could plant instructions that persist into the
system prompt of every later run in that checkout, including another user's
run in the same Discord session worktree or the operator's own WATCH / CLI
runs in the project root. Verified with a PoC: files-write on AGENTS.md
returns ok and the planted text rendered inside
`<project-instructions file="AGENTS.md">`.

Two fixes were offered:

1. Add AGENTS.md / CLAUDE.md to SAFE-2's protected list. That extends the
   captured SAFE-2 list ("env files, git metadata, fledge.toml, specs,
   keystores"), so it needs Leif to confirm in `hi/safe.md` first
   (PROCESS-1). Not built here; left for HI capture.
2. Load the committed blob when the root is a git repo, so only a consented
   commit (git-commit is `dangerous: true`, SAFE-1) can change the prompt.
   This stays inside AGENT-1 ("works from that project's own config") and
   SAFE-1, adds no product surface, and is what this change builds.

ROLES-CHAT-2/3/5 (captured in `hi/roles.md`, not built yet) would also close
the non-ADMIN write path; this change does not depend on them.

Constraints: no new env vars, flags or slash commands; no schema change;
execute.ts hook unchanged (the loader keeps its signature).

## From the change's design.md

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

## From the change's testing.md

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

## Where these lessons go

- `specs/agent/context.md`
