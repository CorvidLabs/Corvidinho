---
module: agent
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
---

# Delta — agent (project instructions read from HEAD, AGENT-1 hardening)

## Modified

### REQUIREMENT REQ-agent-084

When `task run` executes, the execute hook SHALL read `AGENTS.md` and
`CLAUDE.md` from the project root (the nearest directory at or above the run
cwd that contains `.git`, else the cwd) and SHALL include them in the
read-tier and tool-loop system prompts, labelled as project instructions that
cannot widen SAFE-1 consent, the tool allowlist or the capability tier
(AGENT-1). It SHALL NOT read instruction files from directories above the
project root. When the project root contains `.git`, the loader SHALL read
only the copy committed at `HEAD`, through read-only git with hooks off and
repository discovery clamped to the root: a working-tree edit or an
instruction file that is not committed SHALL NOT reach the system prompt
(the non-dangerous file tools can change the working tree without consent;
changing `HEAD` needs a consented dangerous tool, SAFE-1). An uncommitted
instruction file SHALL be refused as not committed, a `.git` that git cannot
read SHALL refuse the files that are present rather than fall back to the
working tree, and a committed symlink SHALL be followed only as a path
inside the commit. Without `.git` the working-tree file SHALL be read. Each
file SHALL be capped at 16 KiB with a truncation marker. A symlink that
resolves outside the project root, a non-regular file, and binary or
non-UTF-8 content SHALL be refused; missing files SHALL be skipped; the
loader SHALL never fail the run. Instruction text SHALL be SAFE-6 scrubbed
before it reaches a provider. When a file was refused or truncated, or its
working-tree copy differs from `HEAD`, one `Text` event SHALL name the files
that were loaded, truncated, deduplicated or refused and say that
working-tree changes were not loaded; a clean load SHALL add no event, so an
ordinary run's event stream is unchanged.

Acceptance Criteria
- A project AGENTS.md / CLAUDE.md appears in the read-tier and tool-loop system prompt under the project-instructions label on every attempt.
- An AGENTS.md in a parent directory outside the project is never read.
- In a git project, AGENTS.md overwritten by files-write after the last commit does not reach the system prompt: the committed text is loaded and one `Text` note says working-tree changes were not loaded; after a commit the new text is loaded with no note.
- In a git project, an untracked AGENTS.md / CLAUDE.md (or any file under an unborn HEAD) is refused as not committed.
- A `.git` that git cannot use refuses present instruction files; the working-tree copy is not loaded.
- A git worktree (session worktree) reads its own HEAD.
- A file over 16 KiB is cut on a UTF-8 boundary with a truncation marker.
- A symlink resolving outside the project, a broken symlink, a symlinked directory hop (committed), a symlink loop (committed), a directory, binary and non-UTF-8 files are refused; missing files are skipped.
- CLAUDE.md symlinked to AGENTS.md is reported as a duplicate and rendered once.
- Secret-shaped text in an instruction file is redacted.
- `projectInstructions: false` or no files leaves the system prompt unchanged.
- A clean load adds no event; a refused, truncated or uncommitted-change file yields exactly one `Text` note across attempts.
