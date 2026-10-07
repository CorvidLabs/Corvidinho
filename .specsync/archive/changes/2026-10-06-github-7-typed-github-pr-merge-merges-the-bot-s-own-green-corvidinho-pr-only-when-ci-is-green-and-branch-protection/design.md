---
change: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
artifact: design
---

# Design

- **Repo identity by slug, not cwd.** GITHUB-7 constrains where the merge
  lands (`CorvidLabs/Corvidinho`), not which worktree the CLI runs from.
  `isCorvidinhoRepoSlug` compares to `CORVIDINHO_REPO` (same constant
  AGENT-18.a uses). Outside that slug: refuse before Octokit merge.
- **Author = token user.** `users.getAuthenticated().login` must equal
  `pull.user.login` (case-insensitive). Never merge someone else's PR.
- **CI via existing helper.** Reuse `fetchCiStatus` / verdict `green` so
  check-runs and commit statuses match `github-ci-status`.
- **Protection by API, not flags.** Call `pulls.merge` without admin/bypass;
  GitHub enforces branch protection, reviews, CODEOWNERS. Default method
  squash (issue #99). Surface API errors as refusal.
- **Injectable client.** `MergeOctokit` + `mergeOwnGreenPr` for fixture
  tests without live tokens. Command stays thin: GITHUB-6 → slug → argv →
  Octokit → helper.
- **No /work auto-merge this slice.** Tool is enough; standing process still
  uses verify + SpecSync green before a human or this tool merges.
