---
id: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
state: draft
type: bug_fix
base_commit: 6e7cbd5d8511c765824f70f11b59b5e2d7da36b5
---

# Repo projects load AGENTS.md and CLAUDE.md from the HEAD commit, not the working tree, so the non-dangerous file tools cannot plant system-prompt instructions for later runs (AGENT-1 hardening, issue #84, review of PR #150)

## Intent

Repo projects load AGENTS.md and CLAUDE.md from the HEAD commit, not the working tree, so the non-dangerous file tools cannot plant system-prompt instructions for later runs (AGENT-1 hardening, issue #84, review of PR #150)

## Affected Canonical Specs

- `agent`

## Acceptance Criteria

- In a project root that holds .git, task run loads AGENTS.md / CLAUDE.md only from the HEAD commit: a working-tree overwrite by files-write never reaches the system prompt (the committed copy is loaded and the run note says working-tree changes were not loaded); an instruction file that exists only in the working tree (untracked, or unborn HEAD) is refused as not committed; a .git that git cannot use refuses present files instead of falling back to the working tree; committed symlinks are followed only inside the commit (outside, broken, directory-hop and looping links refused); cap/UTF-8/binary/scrub rules unchanged; a plain folder with no .git still reads the working tree; local git fixture tests

## No-spec Rationale

Not applicable
