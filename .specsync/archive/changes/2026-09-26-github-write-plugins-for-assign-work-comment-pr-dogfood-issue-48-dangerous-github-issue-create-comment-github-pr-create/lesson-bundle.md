# Lesson bundle — github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: GitHub write plugins for assign→work→comment→PR dogfood (issue #48): dangerous github-issue-create/comment, github-pr-create with Made with Corvidinho attribution, github-pr-review; SAFE-1 CORVIDINHO_ALLOWLIST + GITHUB-6 repo gate; WATCH assignment events from assignees; SpecSync + fixtures no live tokens
- **Kind**: Feature
- **Specs**: plugins, watch
- **Paths**: plugins/github/commands.ts, src/watch/searcher.ts, src/watch/types.ts, tests/github.write.plugin.test.ts, tests/watch.poller.test.ts, tests/plugins.list.smoke.test.ts, tests/fixtures/github/, tests/fixtures/watch/mentions.json, docs/WATCH.md, STATUS.md, specs/plugins/plugins.spec.md, specs/watch/watch.spec.md
- **Acceptance**: Dangerous github-issue-create, github-issue-comment, github-pr-create, github-pr-review plugins land with dangerous:true minTier:1; SAFE-1 denies them in non-interactive without CORVIDINHO_ALLOWLIST; empty GitHub repo allowlist still refuses writes (GITHUB-6/ALLOW-1); github-pr-create appends plain Made with Corvidinho attribution without @handles; WATCH emits assignment events when watch username is in assignees; fixture/dry-run tests pass with no live tokens; STATUS/WATCH.md document dogfood path; fledge lane verify + SpecSync green.

## Evidence

- Verification commit: `bdf6aeb285b89be181e39c0857f0b438dc22757e`
- Base commit: `92519c3c18fa98a6c895cb55196b5529b77c711b`
- Verified by: `specsync check --spec cli --spec plugins --spec watch`

## From the change's context.md

# Context

Issue #48 closes the dogfood gap: tag/assign → work → comment → open PR.
WATCH poll (#19) already does mention/comment/review_request → session stub.
`plugins/github` was read-only (`Write/create omitted`). HI already captures
GITHUB-2 (open PR), GITHUB-3 (comment/review), GITHUB-5 (dangerous create).

This change adds dangerous Octokit write plugins matching Fledge host patterns
(SAFE-1 / CORVIDINHO_ALLOWLIST + GITHUB-6 repo gate), attribution footer on PR
bodies (no @handles), and minimal WATCH **assignment** ingress when the watch
username is in issue/PR assignees. No auto-merge, webhook, or new HI.

## From the change's design.md

# Design

Write path mirrors Discord `discord-post-message`: `dangerous: true`, `minTier: 1`,
`runPlugin` SAFE-1 gate via `CORVIDINHO_ALLOWLIST`, then handler-side GITHUB-6
`checkRepoGate` before Octokit. Optional `CORVIDINHO_GITHUB_DRY_RUN=1` returns
structured dry-run payloads for CI.

`github-pr-create` resolves `--head` from cwd git branch when omitted and appends
`attribution("markdown")` unless the body already contains Made with Corvidinho.

WATCH: search items carry `assignees[]`; when username matches, emit
`assignment` DetectedEvent (`assign-owner/repo#n`) into the existing router
(allowlist unchanged). `involves:` search already surfaces assigned issues.

## From the change's testing.md

# Testing

## Local gates

- `bun test` (incl. `tests/github.write.plugin.test.ts`, watch.poller assignment)
- `bunx tsc --noEmit` / `fledge lane verify`
- `specsync check`
- Dry-run writes with `CORVIDINHO_GITHUB_DRY_RUN=1` — no live token required

## CI

Bun test + Spec Sync Action. No live GITHUB_TOKEN required for write fixtures.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-plugins-048 | plugins list + write test "listed as dangerous" |
| REQ-plugins-049 | write test SAFE-1 deny without allowlist |
| REQ-plugins-050 | write test empty repo allowlist exit 3 |
| REQ-plugins-051 | dry-run pr-create attribution assertions |
| REQ-plugins-052 | dry-run paths succeed without Octokit token |
| REQ-watch-048 | watch.poller fixture expects assignment id |
| REQ-plugins-053 | docs/WATCH.md + STATUS.md updated |

## Where these lessons go

- `specs/plugins/context.md`
- `specs/watch/context.md`
