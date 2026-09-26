---
change: repo-projects-load-agents-md-and-claude-md-from-the-head-commit-not-the-working-tree-so-the-non-dangerous-file-tools
artifact: context
---

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
