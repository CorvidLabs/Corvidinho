---
id: github-7-typed-github-pr-merge-merges-the-bot-s-own-green-corvidinho-pr-only-when-ci-is-green-and-branch-protection
state: approved
type: feature
base_commit: 86d68cd0d65e1836475d5e37a49444bdd0177ecb
---

# GITHUB-7: typed github-pr-merge merges the bot's own green Corvidinho PR only when CI is green and branch protection allows; never others or outside Corvidinho

## Intent

GITHUB-7: typed github-pr-merge merges the bot's own green Corvidinho PR only when CI is green and branch protection allows; never others or outside Corvidinho

## Affected Canonical Specs

- `plugins`

## Acceptance Criteria

- GITHUB-7 (hi/github.md): a dangerous typed plugin github-pr-merge (Octokit pulls.merge, minTier 1) merges only on CorvidLabs/Corvidinho. It refuses any other --repo with a clear reason that outside Corvidinho a human still merges. It merges only a PR whose author login matches the authenticated Octokit user (corvid-agent / token user) — never someone else's PR. Before merge it requires the PR open and not draft, mergeable true, and github-ci-status verdict green for that PR (reuse plugins/github/ciStatus.ts). It never passes admin/bypass flags; branch protection, required reviews and CODEOWNERS stay enforced by the GitHub merge API. Behind GITHUB-6 / SAFE-1 / role gates like other dangerous GitHub writes. Fixture/mock tests cover own-green merge, refuse-other-repo, refuse-other-author, refuse-ci-not-green, refuse-not-mergeable; no live tokens in CI. Specs/docs/STATUS/CHANGELOG note the tool; no live-bridge cut and no 0.0.x bump in this PR.

## No-spec Rationale

Not applicable
