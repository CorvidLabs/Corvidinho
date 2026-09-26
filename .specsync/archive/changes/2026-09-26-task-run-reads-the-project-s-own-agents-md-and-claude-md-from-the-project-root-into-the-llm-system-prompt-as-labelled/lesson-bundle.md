# Lesson bundle — task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Task run reads the project's own AGENTS.md and CLAUDE.md from the project root into the LLM system prompt as labelled project instructions (AGENT-1, issue #84 captured slice): 16 KiB cap with truncation marker, symlinks outside the project refused, binary/non-UTF-8 refused, SAFE-6 scrubbed
- **Kind**: Feature
- **Specs**: agent
- **Paths**: src/agent/project-instructions.ts, src/agent/execute.ts, src/agent/index.ts, tests/agent.project-instructions.test.ts
- **Acceptance**: task run in a project folder puts the project root AGENTS.md and CLAUDE.md (nearest .git at or above cwd, else cwd; never a parent outside the project) into the read-tier and tool-loop system prompts under a project-instructions label; files over 16 KiB are cut with a truncation marker; symlinks resolving outside the project, non-regular, binary and non-UTF-8 files are refused; missing files are skipped; text is SAFE-6 scrubbed; a Text event names loaded/truncated/duplicate/refused files; temp-dir fixture tests

## Evidence

- Verification commit: `84d97a9b95fb8b2cf08de9d44bd3bf65e52ff083`
- Base commit: `1f5406ac242cd72be5a1c8730891f33ff95e25ee`
- Verified by: `specsync check --spec agent`

## From the change's context.md

# Context

Issue #84 asks Corvidinho to follow each repo's own rules before acting. The
captured HI is AGENT-1 (hi/agent.md): "I can give Corvidinho a task in a
project folder and it works from that project's own config and tools, not
from some global sandbox of its own." Before this change the `task run`
system prompt was the same fixed Corvidinho text in every project, so a
project's AGENTS.md / CLAUDE.md never reached the model.

AGENT-13 in the issue (read skills, check for a skill before refusing) is
DRAFT, not captured, so skills and the "look up a skill before refusing"
rule are left for HI capture. The issue's scope note about also reading the
"nearest parent" is part of that draft shape; this slice reads only the
project root.

Many workers edit src/agent/execute.ts in parallel, so the logic lives in a
new module and execute.ts gets small hooks only.

## From the change's design.md

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

## From the change's testing.md

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

## Where these lessons go

- `specs/agent/context.md`
