---
module: plugins
change: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
---

# Delta: plugins (GITHUB-7 typed github-pr-merge)

## Added

### REQUIREMENT REQ-plugins-099

It may merge its own Corvidinho PR when verify and CI are green and branch
protection, reviews and CODEOWNERS allow it; it never bypasses them, never
merges someone else's PR, and outside Corvidinho a human still merges
(GITHUB-7, captured in `hi/github.md`).

`github-pr-merge` SHALL be a dangerous, minTier 1, mutating typed plugin
behind SAFE-1 and GITHUB-6. After the repo gate it SHALL refuse any `--repo`
other than `CorvidLabs/Corvidinho` (`isCorvidinhoRepoSlug` /
`CORVIDINHO_REPO`) with exit 2 and a clear line that outside Corvidinho a
human still merges. It SHALL require the PR author login to match
`users.getAuthenticated`, the PR to be open, not draft and
`mergeable === true`, and `fetchCiStatus` verdict `green`. On success it
SHALL call `pulls.merge` with default method squash and SHALL NOT pass
admin or bypass fields. Dry-run SHALL run the same guards and skip
`pulls.merge`. Logic SHALL live in `plugins/github/merge.ts`
(`mergeOwnGreenPr`) so tests inject a fake Octokit.

Acceptance Criteria
- Allowlisted merge of an own green open mergeable Corvidinho PR calls
  `pulls.merge` (squash) with no admin field (`tests/github.merge.plugin.test.ts`).
- Outside Corvidinho, other author, non-green CI, draft/closed/not-mergeable
  refuse exit 2; dry-run skips merge; SAFE-1 denies without allowlist;
  `plugins list` names `github-pr-merge`.
