# Lesson bundle — github-ci-status-for-a-pr-or-ref-with-an-overall-ci-verdict-incl-legacy-commit-statuses-github-4-issue-94-captured

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Github-ci-status for a PR or ref with an overall CI verdict incl. legacy commit statuses (GITHUB-4, issue #94 captured slice)
- **Kind**: Feature
- **Specs**: plugins
- **Paths**: plugins/github/commands.ts, plugins/github/ciStatus.ts, tests/github.ci-status.test.ts, specs/plugins/plugins.spec.md
- **Acceptance**: github-ci-status accepts a PR number or a ref (branch, tag, commit SHA) with git ref-name validation and option-looking values refused; result data carries verdict green/red/pending/none computed from check runs plus legacy combined commit statuses; per-check rows keep name/state/bucket/link and add kind/status/conclusion; stays dangerous=false minTier 0 behind the --repo gate; mocked-Octokit tests green without network or tokens

## Evidence

- Verification commit: `c851879f4aefe9e31990e55cf2bbe915496ba9e4`
- Base commit: `8747a9abb99c2322ea67c40da96fb60bc69172bc`
- Verified by: `specsync check --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- New `plugins/github/ciStatus.ts` holds pure helpers against a structural
  `CiOctokit` type (the real `Octokit` satisfies it), so tests pass a fake
  client: `parseCiSelector`, `validateCiRef`, `checkRunRow`,
  `commitStatusRow`, `ciVerdict`, `countBuckets`, `fetchCiStatus`,
  `ciStatusMessage`.
- The `github-ci-status` handler in `commands.ts` keeps `requireRepo` (repo
  gate) first, validates the selector before creating a client (bad input
  never needs a token), lazy-loads `ciStatus.ts`, and returns the verdict in
  both `data` and `message` (message is also set under `--json` so the agent
  tool loop sees the one-line summary).
- Selector: 1–9 digits ⇒ PR number (`pulls.get` ⇒ head SHA); anything else ⇒
  ref after validation. Digits-only branches/tags are named `heads/<n>` /
  `tags/<n>`; 10+ digit selectors are treated as (short) SHAs.
- Pinning: a ref is resolved once with `repos.getCommit` (`per_page: 1`, so
  the file list stays small) and both listings are read by that SHA, never
  by the moving branch name. `data.sha` is that resolved SHA (or the PR head
  SHA). An unknown ref fails at resolution, before any listing.
- Rows keep `name/state/bucket/link` and add `kind` (`check`/`status`),
  `status`, `conclusion`. Buckets: success ⇒ pass; skipped/neutral ⇒
  skipping (was mis-bucketed as fail); failure/cancelled/timed_out/
  action_required ⇒ fail; no conclusion or unknown (e.g. stale) ⇒ pending.
  Statuses: success ⇒ pass; failure/error ⇒ fail; else pending.
- Verdict precedence: none (no rows) → red (any fail) → pending (any
  pending) → green. Unknown states never count as green.
- `data` becomes `{ target, pr, ref, sha, verdict, counts, checks, truncated,
  warnings }`; the old per-check list lives under `data.checks` unchanged.
- Paging: 100 per page, stop on a short page or `total_count`, hard cap 10
  pages per source (`truncated: true` + warning). Unlisted rows may fail, so
  a truncated listing whose seen rows would give `green` reports `pending`
  (the warning says so); `red` stays `red`.
- A 403 on commit statuses that denies the permission (token without that
  scope) degrades to check runs only with a warning
  (`isStatusesPermissionDenied`). A 403 that is a primary rate limit
  (`x-ratelimit-remaining: 0`), a secondary rate limit (`retry-after`, or a
  rate-limit / abuse message) or SSO/SAML enforcement (`x-github-sso`, or a
  SAML/SSO message) fails the command, since the statuses were only unread
  and a legacy `failure` context could hide behind a `green`. Every other
  error fails as before.
- `ciStatusMessage` appends warnings for every verdict, including `none`.

## From the change's testing.md

# Testing

| REQ | Evidence |
|-----|----------|
| REQ-plugins-094 | `tests/github.ci-status.test.ts`: selector (PR digits vs branch/tag/SHA/`heads/123`), option-looking + git ref-name refusals; verdict green/red/pending/none incl. red-over-pending, stale ⇒ pending, legacy statuses; row fields kept + added; mocked-Octokit fetch for PR (head SHA) and ref (no `pulls.get`; resolved once via `repos.getCommit`, both listings by that SHA even when the branch moves; unknown ref fails before listing), status-only repo, paging + cap for check runs and for statuses (all-pass truncated ⇒ pending, seen failure stays red), statuses permission 403 warning (also in the `none` message), rate-limit / secondary-limit / abuse / SSO 403s propagate, error propagation; handler: dangerous=false minTier=0, `--repo` gate exit 3, usage/extra-arg refusals before token use, end-to-end through Octokit with a stubbed `fetch` and a fixture token |

## Requirement evidence

| Requirement | Test | Evidence |
|-------------|------|----------|
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › selector | PR digits vs branch/tag/SHA/`heads/123`; option-looking and git ref-name refusals |
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › verdict | green/red/pending/none, red over pending, stale ⇒ pending, legacy statuses, row fields kept + added |
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › fetch (mocked Octokit) | PR head SHA; ref pinned via `repos.getCommit` (moving branch read at the resolved SHA only); status-only repo; paging cap for check runs and statuses (truncated all-pass ⇒ pending); permission 403 degrades with warning (also for `none`); rate-limit / SSO 403 propagate |
| REQ-plugins-094 | `tests/github.ci-status.test.ts` › plugin handler | dangerous=false minTier=0; `--repo` gate exit 3; refusals before token use; end-to-end Octokit with stubbed `fetch` (resolve, then both listings by SHA) |

No network and no real token: the fake Octokit and the stubbed transport
serve fixtures in-process.

Commands: `bun test tests/github.ci-status.test.ts`, `bun test`,
`bunx tsc --noEmit`, `specsync check --require-coverage 100`,
`fledge lanes run verify --non-interactive`.

## Where these lessons go

- `specs/plugins/context.md`
