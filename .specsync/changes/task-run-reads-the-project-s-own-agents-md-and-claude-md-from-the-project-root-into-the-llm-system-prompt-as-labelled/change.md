---
id: task-run-reads-the-project-s-own-agents-md-and-claude-md-from-the-project-root-into-the-llm-system-prompt-as-labelled
state: implementing
type: feature
base_commit: 1f5406ac242cd72be5a1c8730891f33ff95e25ee
---

# Task run reads the project's own AGENTS.md and CLAUDE.md from the project root into the LLM system prompt as labelled project instructions (AGENT-1, issue #84 captured slice): 16 KiB cap with truncation marker, symlinks outside the project refused, binary/non-UTF-8 refused, SAFE-6 scrubbed

## Intent

Task run reads the project's own AGENTS.md and CLAUDE.md from the project root into the LLM system prompt as labelled project instructions (AGENT-1, issue #84 captured slice): 16 KiB cap with truncation marker, symlinks outside the project refused, binary/non-UTF-8 refused, SAFE-6 scrubbed

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- task run in a project folder puts the project root AGENTS.md and CLAUDE.md (nearest .git at or above cwd, else cwd; never a parent outside the project) into the read-tier and tool-loop system prompts under a project-instructions label; files over 16 KiB are cut with a truncation marker; symlinks resolving outside the project, non-regular, binary and non-UTF-8 files are refused; missing files are skipped; text is SAFE-6 scrubbed; a Text event names loaded/truncated/duplicate/refused files; temp-dir fixture tests

## No-spec Rationale

Not applicable
