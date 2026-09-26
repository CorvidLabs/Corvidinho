---
module: agent
change: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
---

# Delta — agent (project instructions, AGENT-1)

## Added

### REQUIREMENT REQ-agent-084

When `task run` executes, the execute hook SHALL read `AGENTS.md` and
`CLAUDE.md` from the project root (the nearest directory at or above the run
cwd that contains `.git`, else the cwd) and SHALL include them in the
read-tier and tool-loop system prompts, labelled as project instructions that
cannot widen SAFE-1 consent, the tool allowlist or the capability tier
(AGENT-1). It SHALL NOT read instruction files from directories above the
project root. Each file SHALL be capped at 16 KiB with a truncation marker. A
symlink that resolves outside the project root, a non-regular file, and
binary or non-UTF-8 content SHALL be refused; missing files SHALL be skipped;
the loader SHALL never fail the run. Instruction text SHALL be SAFE-6
scrubbed before it reaches a provider. One `Text` event SHALL name the files
that were loaded, truncated, deduplicated or refused.

Acceptance Criteria
- A project AGENTS.md / CLAUDE.md appears in the read-tier and tool-loop system prompt under the project-instructions label on every attempt.
- An AGENTS.md in a parent directory outside the project is never read.
- A file over 16 KiB is cut on a UTF-8 boundary with a truncation marker.
- A symlink resolving outside the project, a broken symlink, a directory, binary and non-UTF-8 files are refused; missing files are skipped.
- CLAUDE.md symlinked to AGENTS.md is reported as a duplicate and rendered once.
- Secret-shaped text in an instruction file is redacted.
- `projectInstructions: false` or no files leaves the system prompt unchanged.
