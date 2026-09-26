---
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
artifact: design
---

# Design

New module `src/agent/project-instructions.ts`:

- `findProjectRoot(cwd)`: nearest directory at or above `cwd` holding `.git`
  (dir for a repo, file for a worktree); `cwd` itself when there is none.
  Nothing above that root is read.
- `loadProjectInstructions(cwd, { maxBytes? })`: for `AGENTS.md` then
  `CLAUDE.md` at the root. Missing file: skipped. `realpath` must stay
  inside the real project root (else refused "resolves outside the project
  root"); broken symlink refused. Opened with `O_NOFOLLOW | O_NONBLOCK`,
  `fstat` must be a regular file, and on Linux `/proc/self/fd/N` is checked
  again against the root. Reads at most `maxBytes` (16 KiB); longer files are
  cut on a UTF-8 boundary with `[truncated: NAME is N bytes; only the first
  M bytes are shown]`. NUL byte -> refused "binary content"; invalid UTF-8
  -> refused "not UTF-8 text". A second name resolving to the same real file
  (CLAUDE.md -> AGENTS.md symlink) is a `duplicate`, not read twice. Text is
  passed through `scrubSecrets` (SAFE-6). Never throws.
- `renderProjectInstructions(pi)`: header saying these are the project's
  instructions and cannot widen SAFE-1 consent, the tool allowlist or the
  capability tier, then one `<project-instructions file="NAME">` block per
  loaded file (a closing tag inside a file is escaped). Empty when nothing
  loaded.
- `describeProjectInstructions(pi)`: one-line summary of every file found,
  or null.
- `projectInstructionsWarning(pi)`: that summary only when a file was
  refused or truncated, else null.
- `withProjectInstructions(system, block)`: append helper.

Hook in `createTaskExecute` (`src/agent/execute.ts`): load once per execute
fn from `cwd` (opt-out `projectInstructions: false`), append the block to the
read-tier and tool-loop system prompts, and emit the warning (if any) as
one `Text` event on the first attempt. A clean load emits nothing, so the
`task run --json` / NDJSON event stream of an ordinary run is unchanged
(the #139 exact-event test stays as it is). No new CLI flag, env var or persisted data.
