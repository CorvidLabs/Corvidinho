---
id: before-a-pr-opens-a-second-model-reviews-the-diff-in-bounded-rounds-and-the-pr-lists-what-it-raised-and-what-changed
state: implementing
type: feature
base_commit: 3799e4ebd1cd3a3d7f72a97fd42184ac0a10a28d
---

# Before a PR opens, a second model reviews the diff in bounded rounds, and the PR lists what it raised and what changed (GITHUB-9, GITHUB-9.a)

## Intent

Before a PR opens, a second model reviews the diff in bounded rounds, and the PR lists what it raised and what changed (GITHUB-9, GITHUB-9.a)

## Affected Canonical Specs

- `plugins`
- `agent`
- `discord`

## Acceptance Criteria

- GITHUB-9 (captured on main from Leif's 2026-09-28 interview) and GITHUB-9.a (captured in this change with hi from Leif's 2026-09-30 interview round 13) hold for every github-pr-create path — a chat, slash or button run, a local task run and a delegate worker hand the handler their run (env, authors, one no-tools completion through the run's providers call path and SAFE-8 spend guard), while corvidinho plugins run and the /work PR step have no run model: with a run model the run's work tree is staged into a temporary GIT_INDEX_FILE (real index untouched) and its diff against the merge-base with --base (scrubbed, fenced as untrusted data, capped at 200 KiB) is reviewed by the first configured model (CORVIDINHO_LLM_MODEL then _READ/_TOOL/_CODE, every chain entry, key set) whose model id is none of the change's authors (the run chain's models incl. AGENT-11 fallbacks, delegate workers' reported models and a worker's lead's via CORVIDINHO_DELEGATE_AUTHORS, authors recorded for the branch); there is no reviewer setting; round k of REVIEW_MAX_ROUNDS = 3 that raises findings (at most 10, scrubbed) holds the PR with them fenced and reviewHold findings; a clean round, an unchanged tree after findings (declined, listed as not changed) or round 3 ends the cycle; rounds are stored in the lazily created pr_review_rounds table keyed (repo, branch) and tied to tree ids (no schema version bump; listed in SCRUB_TARGETS); the branch on GitHub (dry run: the push remote) must be the reviewed tree; the PR body gets a '## Second-model review' section with the reviewer, rounds used of 3, what each round raised and the changed paths from git, fenced, no amounts; without a run model no round starts and only a finished cycle for the exact tree on GitHub opens the PR (/work says why on its PR line, reason not-reviewed); no second model, a provider error (fixed reason), a diff over the cap, no changes, an unpushed or different branch tree each refuse in one plain line, and the run's reply ends with that line (GITHUB-9.a); a SpendCapRefusal of the review call ends the attempt at the spend cap's ask, never 'unavailable'; review holds never count toward AGENT-16/17; the reviewer's usage is recorded under its own label so the owner footer prices it or shows unknown; must-ask and repo gates still apply first; tests/work.review.test.ts and the updated github-write, roles and work.pr tests fail on the base sources and pass on the branch

## No-spec Rationale

Not applicable
