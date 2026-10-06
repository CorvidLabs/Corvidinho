---
hi: 1
families: [GITHUB]
owner: leif
---

# GitHub

## Intent

The agent should be a normal citizen of the repo: read issues, open PRs, check CI, leave reviews — through typed tools with safety markings, not by shelling out to `gh` and hoping. Outside Corvidinho, humans still merge; on Corvidinho it may merge its own green PRs (GITHUB-7).

## Criteria

- **GITHUB-1**  I can ask it to list or open issues and pull requests on a repo I care about, and it does that through reviewed tools rather than improvised shell.
- **GITHUB-2**  It can open a pull request from work it did in a worktree, with a description that matches what changed.
- **GITHUB-3**  It can read a PR diff, comment, and submit a review without me pasting the patch into chat.
- **GITHUB-4**  It can tell me whether CI is green or red for a PR or ref.
- **GITHUB-5**  Creating issues and PRs counts as dangerous work: under non-interactive mode it needs an explicit allow, not a silent post.
- **GITHUB-6**  There are repos it simply will not touch, even if prompted, so a bad instruction cannot spray noise across the org.
- **GITHUB-7**  It may merge its own Corvidinho PR when verify and CI are green and branch protection, reviews and CODEOWNERS allow it; it never bypasses them, never merges someone else's PR, and outside Corvidinho a human still merges.
  - **GITHUB-7.a**  It merges only PRs it opened from its own talk branches with its own token, and only when I ask; it never marks its own /work draft ready, won't merge a PR that changes its own gates (.github, fledge.toml, hi/, AGENTS.md, CODEOWNERS), and counts CI green only when smoke and spec-sync pass at the head.
- **GITHUB-9**  Before the PR, a second model reviews the diff in bounded rounds, and the PR lists what it raised and what changed.
  - **GITHUB-9.a**  The reviewer is the first other model I've configured that didn't write the change; there's no reviewer setting, and with no second model there's no PR and the reply says why.
