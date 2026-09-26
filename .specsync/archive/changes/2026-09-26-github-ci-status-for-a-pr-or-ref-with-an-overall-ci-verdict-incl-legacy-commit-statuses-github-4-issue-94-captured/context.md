---
change: github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured
artifact: context
---

# Context

Issue #94 ("fix its own red CI") cites captured **GITHUB-4** (`hi/github.md`):
"It can tell me whether CI is green or red for a PR or ref." Today
`github-ci-status` (`plugins/github/commands.ts`) only takes a PR number,
lists check runs without an overall answer, ignores legacy commit statuses,
and buckets `skipped`/`neutral` runs as `fail`.

This change is the captured slice only: PR **or ref** input plus one verdict
(`green` / `red` / `pending` / `none`) covering check runs and combined commit
statuses. The CI auto-fix loop in #94 is **DRAFT GITHUB-11** (pending Leif's
confirmation) and is not built here; it is left for HI capture.

Constraints: stay a read (`dangerous: false`, `minTier: 0`), keep the
`--repo` gate (GITHUB-6), keep the per-check row fields, and only touch the
`github-ci-status` handler region of `commands.ts` because a parallel worker
adds new GitHub commands in a separate file. Tests use a mocked Octokit
(fixtures only; no network, no real tokens).
