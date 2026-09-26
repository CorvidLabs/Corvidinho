# Lesson bundle — work-opens-a-draft-pr-from-its-verified-worktree-issue-88-autonomous-3-github-2-github-5-agent-4-after-a-work-run-only

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: /work opens a draft PR from its verified worktree (issue 88, AUTONOMOUS-3, GITHUB-2, GITHUB-5, AGENT-4): after a /work run, only when git-commit, git-push and github-pr-create are allowlisted for non-interactive use, commit and push the talk branch and open a draft PR through the existing git and github plugins with a description built from the real diff and the verify result; otherwise reply plainly why no PR was opened
- **Kind**: Feature
- **Specs**: discord
- **Paths**: src/work/, src/discord/command-handlers/work.ts, src/discord/agent-client.ts, src/discord/types.ts, src/discord/slash-types.ts, tests/work.pr.test.ts, specs/discord/, docs/discord.md
- **Acceptance**: After a /work run in a git worktree with changes, when git-commit, git-push and github-pr-create are allowlisted (GITHUB-5) and the tree passed the verify lane, the talk branch is committed, pushed and opened as a draft PR via the github plugin whose body lists the real changed files, diffstat, commits and verify result; a failed run, failed verify, no changes, missing allow or repo gate refusal opens no PR and the /work reply says why in one plain line; fixture tests mock the plugins and verify lane

## Evidence

- Verification commit: `428f7c01b7ab04645c3ed798e93fe586ed77e6a7`
- Base commit: `19683b6059902c62baeddb9d2110f64f82dc3009`
- Verified by: `specsync check --spec discord`

## From the change's context.md

# Context

Issue #88 (M3 "real dev teammate"): issue → worktree → verify → PR, end to
end. Captured HI: AUTONOMOUS-3 (a work task gets its own git worktree, does
the job, and can open a PR when I allow that path), GITHUB-2 (PR from worktree
work with a description that matches what changed), GITHUB-5 (creating PRs is
dangerous: non-interactive needs an explicit allow), AGENT-2 and AGENT-4/4.a.

What was already on main: `/work` gets its own `talk/<session>` worktree
(SESSION-WORKTREE-1); `task run` plans with the SpecSync briefing (AGENT-2)
and runs verify with retries fed the failure output (AGENT-4/4.a); typed
`git-commit` / `git-push` (#82) and `github-pr-create` (dangerous, attribution
footer) exist. The missing link: nothing ever pushed a finished /work
worktree or opened a PR from it; the reply just said "Done".

In flight elsewhere: #152 / #155 (#85) drop `--no-verify` from the Discord
spawn so /work runs verify in the child. This change does not depend on them:
if the run's result frame does not say `verified`, the PR step runs the verify
lane once itself before shipping.

Out of scope (draft, not acceptance criteria): AUTONOMOUS-14 durable queue,
AGENT-14/15, issue-number branch names / "Closes #N" (no captured id), merging
(#99), buddy review (#92), scans (#91), comment back on the issue.

## From the change's design.md

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

## From the change's testing.md

# Testing

`tests/work.pr.test.ts` — temp repos under mkdtemp with a local bare
`origin` at `<tmp>/acme/widget.git`; git config isolated; github-pr-create in
`CORVIDINHO_GITHUB_DRY_RUN` or mocked; verify lane mocked. No network, no
tokens, no worktrees or `talk/*` branches in this repo.

| REQ | Case |
|-----|------|
| REQ-discord-088 | Title: first line, collapsed, ≤72, leading `-` stripped; commit message shape |
| REQ-discord-088 | Body lists A/M/D/R files, diffstat, commits, verify line; backtick run gets a longer fence; token scrubbed |
| REQ-discord-088 | Failed run / verify failed in run → no PR, no plugin calls |
| REQ-discord-088 | Scoped dir → "did not run in a git worktree"; clean tree → "none — no changes" |
| REQ-discord-088 | Not allowlisted → names missing plugins, nothing committed/pushed/verified |
| REQ-discord-088 | Repo gate refusal → no plugin calls |
| REQ-discord-088 | Unverified run re-runs verify once in the worktree; failure ships nothing |
| REQ-discord-088 | Dirty verified tree → real commit + push to bare remote + dry-run draft PR; body from real diff |
| REQ-discord-088 | Agent already committed → git-commit not required; re-verify before push; PR URL line |
| REQ-discord-088 | Push failure / PR failure → plain line; empty plugin allowlist still denied (SAFE-1) |
| REQ-discord-088 | Spawn client copies verified/verifySkipped/state from the result frame |
| REQ-discord-088 | /work passes run facts + active worktree to the PR step; `PR:` line above the summary; default step in scoped dir; throwing step never breaks the reply |

Gates: `bunx tsc --noEmit`, `bun test`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/discord/context.md`
