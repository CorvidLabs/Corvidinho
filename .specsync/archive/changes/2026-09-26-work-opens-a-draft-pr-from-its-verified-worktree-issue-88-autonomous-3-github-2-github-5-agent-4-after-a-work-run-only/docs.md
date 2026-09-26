---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: docs
---

# Docs

- `docs/discord.md`: new "`/work` → draft PR" subsection under Session
  worktrees — the `PR:` reply line, the gate table (run/verify, worktree with
  changes, allowlist of `git-commit` / `git-push` / `github-pr-create`, repo
  gate, verify lane), the plugin chain, and the note that allowlisting is
  process-wide (the spawned agent can call those plugins too).
- `specs/discord/discord.spec.md`: files + Public API + invariant line.
- No CHANGELOG / STATUS / version bump here (release PRs do that).
