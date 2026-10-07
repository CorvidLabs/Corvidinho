---
id: it-can-merge-its-own-corvidinho-pr-when-i-ask-and-every-gate-is-green-never-its-gates-never-someone-else-s-github-7
state: verifying
type: feature
base_commit: 19f8cd8c9b8363361de431d380d956021e75d5e0
---

# It can merge its own Corvidinho PR when I ask and every gate is green; never its gates, never someone else's (GITHUB-7, GITHUB-7.a)

## Intent

It can merge its own Corvidinho PR when I ask and every gate is green; never its gates, never someone else's (GITHUB-7, GITHUB-7.a)

## Affected Canonical Specs

- `plugins`
- `agent`

## Acceptance Criteria

- GITHUB-7 (on main) and GITHUB-7.a (captured with hi in this change from Leif's 2026-09-28 interview record, round 16 of 2026-10-06) hold through one checked tool, github-pr-merge (plugins/github/merge.ts, dangerous, mutating, minTier 1): it refuses with no card unless the call comes from the owner's own interactive run (the owner's Discord chat, /session start, /work or an ask answer of one, role re-resolved now; or the local CLI nothing spawned — never team, community, WATCH (the owner's own GitHub-triggered run included), a schedule or a delegate/council worker), the repo is CorvidLabs/Corvidinho (outside it a human still merges), the PR is open, comes from one of its own talk/<id>-<16 hex> branches in that repo and was opened by the token's own user (author id == token id), is not a draft, was never marked ready by its own token and was marked ready by a person (not an app), its head is still the --sha named, no changed path (rename old paths included; list read whole) is a gate (.github/, fledge.toml, .fledge/, hi/, AGENTS.md, CODEOWNERS, .trust.toml, bunfig.toml, .specsync config, the merge gate's own files), no reviewer's latest review requests changes, the smoke and spec-sync check runs from GitHub Actions passed at exactly that head with the whole CI verdict there green, and GitHub says mergeable with mergeable_state clean or has_hooks; a passing gate raises the owner's mustask-merge Approve card (class destructive: Approve plus the one-time code) showing the PR, head sha and squash title; after approval the handler re-runs the whole gate and squash-merges via pulls.merge with the expected head sha and the PR title (#N), and its reply names the merge sha; every attempt leaves a SAFE-5 row (denied as github-pr-merge:<reason>, or started then ok/error); the tool loop offers it only to the owner's own interactive run with one operator line otherwise; tests with a fake GitHub client cover each refusal reason, a passing merge, the card engine and the catalog.

## No-spec Rationale

Not applicable
