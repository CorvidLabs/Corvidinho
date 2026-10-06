---
module: discord
change: work-runs-its-second-model-review-rounds-before-the-pr-and-skips-with-not-reviewed-otherwise-github-9
---

# Delta: discord (/work commits and pushes only a reviewed tree — GITHUB-9 / GITHUB-9.a)

## Modified

### REQUIREMENT REQ-discord-088

After a `/work` run finishes, the handler SHALL try to ship the run's active
git worktree as a **draft** pull request (AUTONOMOUS-3 / GITHUB-2) and SHALL
add exactly one `PR:` line to its reply, above the run summary. A PR SHALL be
opened only when all of these hold, checked before any commit or push:

- the run finished cleanly and its result frame does not report a failed
  verify (AGENT-4);
- the work ran in an active git worktree with a branch, and that worktree has
  uncommitted changes or commits ahead of the merge-base with the remote
  default branch (`refs/remotes/origin/HEAD`, else `main`), with no conflicts;
- `git-push` and `github-pr-create` — plus `git-commit` when the tree is
  dirty — are in the non-interactive plugin allowlist (GITHUB-5 / SAFE-1);
- the push remote's OWNER/REPO passes the GitHub repo gate (GITHUB-6);
- the tree passed `fledge lanes run verify --non-interactive`: taken from the
  run's result frame when it reports `verified`, else run once in the worktree
  before anything is pushed (AGENT-4).

The PR step SHALL run only for the owner (ADMIN) or a declared team member
(IDENTITY-10; the role is re-resolved from the live people list after the
run, REQ-discord-065). Community never starts `/work` (IDENTITY-11.a,
REQ-discord-065), so it never reaches this step; a team member demoted to
community during the run keeps the changes on the work branch
(ROLES-CHAT-3).

The steps SHALL run through the existing typed plugins with
`nonInteractive: true` — `git-commit` (explicit paths from `git status`),
`git-push`, then `github-pr-create --draft --head <talk branch> --base
<default branch>` — so SAFE-1 denial and SAFE-5 audit apply. The PR body
SHALL be built from the real diff against the merge-base (name-status file
list, diffstat, commit subjects) plus the verify result, with repo, model and
chat text inside code fences, and title, body and commit message SHALL be
secret-scrubbed (SAFE-6). The Discord spawn client SHALL pass the result
frame's `verified` / `verifySkipped` / `state` through as
`AgentSpawnResult.task`. When a gate fails or a step errors, the `PR:` line
SHALL say plainly why and SHALL NOT claim a PR. No new slash command, option,
env var, table or column.

A second-model review SHALL have finished for exactly the tree about to be
committed and pushed (GITHUB-9 / GITHUB-9.a, REQ-plugins-092): an owner or
team `/work` run drives the review rounds itself once its tree is verified
(REQ-agent-092; `task run` wires it, REQ-cli-092). Right before the commit
(after the verify re-run, before `git-commit`, `git-push` and
`github-pr-create`), `openWorkPr` SHALL check `workTreeReviewed`: the latest
review cycle for (OWNER/REPO, branch) ended, and its last round reviewed the
tree a commit of every path `git status` shows would have (tracked and
untracked, non-ignored files as they are in the work tree); a tree or record
that cannot be read fails closed. With none, the outcome SHALL be
`opened: false` with reason `not-reviewed` and the line `PR: not opened —
<why> The changes stay on branch <branch>.`, where <why> is the run's own
one-line reason from its result frame (`review` with state `refused`; with
no second model configured, that there is none, GITHUB-9.a), else `no
second-model review finished for the tree this /work run would ship, so
there is no PR (GITHUB-9).`; nothing SHALL be committed or pushed. The
Discord spawn client SHALL pass the result frame's `review` through on
`AgentSpawnResult.task` (`{state: "finished"}`, or `{state: "refused",
reason}` with the reason secret-scrubbed, on one line and at most 300
characters; any other shape is dropped). `github-pr-create` still holds the
PR to the same review (the branch on GitHub must be the reviewed tree, and
this step has no run model, so it starts no round): when that call is held
(`reviewHold`), the outcome SHALL be `not-reviewed` with the line `PR: not
opened — <the gate's reason> The changes stay on branch <branch>.` (the
branch is then pushed), never a claimed PR. The PR body's Verify section
SHALL say that a second model reviewed the tree and point to the
`## Second-model review` section, which `github-pr-create` writes after the
body from the review record: what each round raised and what changed after
it.

Acceptance Criteria
- A dirty verified worktree with the three plugins allowlisted is committed, pushed and opened as a draft PR whose body lists the changed files, diffstat, commits and verify result.
- Missing allowlist entries are named in the reply and nothing is committed, pushed or verified.
- A failed run, failed verify, scoped (non-git) dir, clean tree, conflicts or repo-gate refusal opens no PR and says why in one line.
- An unverified run triggers one verify-lane run in the worktree before push; a failing lane ships nothing.
- Push or PR-create failure yields a plain line and never a claimed PR.
- Fixture tests use temp repos, a local bare remote, the dry-run github plugin and a mocked verify lane.
- A /work by anyone other than ADMIN (the owner) or a declared team member (IDENTITY-10, re-resolved from the people list after the run) never runs the PR step (ROLES-CHAT-3): a community /work never runs at all (IDENTITY-11.a; the reply is the ephemeral `not authorized`), and a team member demoted during the run gets a reply that says the changes stay on the work branch.
- A team member's /work reaches the PR step with the same gates as the owner's; a team member demoted during the run does not.
- Nothing is committed or pushed unless the worktree HEAD is the work branch and not the base; a switched or detached HEAD opens no PR.
- With no finished second-model review for the tree it would ship, the PR step ends `not-reviewed` with `PR: not opened — no second-model review finished for the tree this /work run would ship, so there is no PR (GITHUB-9). The changes stay on branch …`, runs no plugin and commits and pushes nothing; a finished review of an earlier tree of the branch does not count; with one finished for exactly that tree (its untracked files included) it opens, and the PR body carries the reviewed line and the `## Second-model review` section.
- With the run's refusal on its result frame (no second model), the line is `PR: not opened — there is no second model to review the diff — … (GITHUB-9.a). The changes stay on branch …` and nothing is committed or pushed.
- An owner /work run through the real tool loop, verify gate and review hook (round 1's findings changed, round 2 clean) then opens the PR whose section lists round 1's finding and the path that changed after it.
- The spawn client passes the result frame's `review` through: `finished` as is, `refused` with its reason scrubbed onto one line; any other shape is dropped.
