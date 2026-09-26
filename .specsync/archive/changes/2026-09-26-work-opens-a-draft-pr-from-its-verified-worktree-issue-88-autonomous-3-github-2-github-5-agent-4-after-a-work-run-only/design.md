---
change: work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only
artifact: design
---

# Design

New module `src/work/pr.ts` — `openWorkPr(input, deps)` returns
`{ opened, line, … }` and never throws. Order (cheap checks first, nothing
dangerous until every gate holds):

1. Run failed (`ok=false`) or its result frame says verify failed → no PR.
2. No active worktree / branch (scoped dir) → no PR.
3. `git status` (porcelain, untracked=all) + merge-base with
   `origin/<default branch>` (from `refs/remotes/origin/HEAD`, else `main`).
   Conflicts → no PR; clean and zero commits ahead → "none".
4. GITHUB-5: `git-commit` (only if dirty), `git-push`, `github-pr-create` must
   all be in the non-interactive allowlist (`CORVIDINHO_ALLOWLIST`) — checked
   up front so nothing is committed or pushed half-way.
5. GITHUB-6: OWNER/REPO from the push URL passes `checkRepoGate` (same gate
   `github-pr-create` uses); `git-push` re-checks with file + env.
6. AGENT-4: trust `task.verified === true` from the run; otherwise run the
   verify lane once in the worktree; failure → no PR.
7. `git-commit --message … -- <paths from status>` (dirty only) →
   `git-push --remote origin` → `github-pr-create --repo --title --body --head
   --base --draft`, all via `runPlugin(nonInteractive: true)` so SAFE-1 deny
   and SAFE-5 audit rows apply.

`src/work/pr-body.ts` builds title (first line, ≤72, leading `-` stripped so
it never reads as a flag), commit message, and body from the real diff:
name-status list, diffstat, commit subjects, verify line. Repo/model/chat text
sits in code fences (longer fence than any backtick run) so it cannot mention
or link; title/body/commit message are `scrubSecrets`-ed (SAFE-6). The github
plugin appends the attribution footer.

Hooks: `AgentSpawnResult.task` (verify facts from the result frame, set by
the Discord spawn client); `SlashContext.openWorkPr` (test injection);
`/work` adds one `PR:` line above the summary so the 1900-char clip never
drops it. No new slash command, option, env var, table or column.
