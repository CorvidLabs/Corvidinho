# Lesson bundle — watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH GitHub mention/review ingress poll-first thin slice (issue #19): poll Octokit search for allowlisted repo mentions/review_requests/issue_comments → allowlist gate (ALLOW-1/2/5) before session stub; document poll-for-VM vs webhook-when-public-URL; fixture tests; no ProcessManager; webhook deferred follow-up; STATUS Done for #19
- **Kind**: Feature
- **Specs**: watch, cli
- **Paths**: src/watch, src/cli.ts, specs/watch, tests/watch.router.test.ts, tests/watch.poller.test.ts, tests/watch.config.test.ts, tests/watch.cli.test.ts, tests/fixtures/watch, STATUS.md, allowlist.example.toml, README.md, docs/WATCH.md, .specsync/config.toml, .specsync/registry.toml
- **Acceptance**: Documented poll-first for bot/VM (webhook when public URL) in docs/WATCH.md + STATUS. Event→session path for mention/review_request/issue_comment on allowlisted repos+users only (ALLOW-1/2); denied contacts refuse quietly (ALLOW-5) with no session spawn. Empty github allowlists fail-start poller. Fixture tests without live webhook secrets; Octokit-shaped injectable searcher; no ProcessManager; no auto-merge. CLI corvidinho github watch. Webhook deferred follow-up. STATUS Done cites #19→this PR. SpecSync + fledge verify green.

## Evidence

- Verification commit: `735985ef1d1f0b7c08ba7e93913de108cecd91d1`
- Base commit: `9095c9e96aa26d8198d6a4a0c2fd33e0c4611acf`
- Verified by: `specsync check --spec cli --spec watch`

## From the change's context.md

# Context

Issue #19 WATCH: GitHub citizen listen — when someone @mentions / review-requests
Corvidinho on allowlisted org/repo/user, start or continue an agent session.
Typed Octokit reads (#4/#15) already exist; this is **ingress**, not more reads.

Ancestor map (archived corvid-agent): poll preferred for bot/VM without public
URL (`MentionPollingService` + `GitHubSearcher`); webhook when public URL +
HMAC secret exist. Gate every event through allowlist before session spawn
(ALLOW-1). Skip auto-merge / auto-update / CI-retry for v1.

Corvidinho shape: headless CLI thin like Discord HEAR — injectable searcher
(fixtures in CI), in-memory session stub keyed by `owner/repo#number`, spawn
`task run --no-verify` (or echo). No ProcessManager. No invent HI/ACCESS/bounty.

Memory/STATUS preference: **poll-first for VM**; webhook deferred follow-up.

## From the change's design.md

# Design

Poll loop (interval, default 60s) → injectable SearchClient (Octokit live /
fixture tests) → normalize DetectedEvent → dedup processed ids →
`routeEvent` (repo + user allowlist BEFORE session) → SessionStore by
`owner/repo#number` → AgentClient.runChat (`task run --no-verify` or echo).

Webhook HMAC path deferred (follow-up issue). No ProcessManager. No auto-merge.
Default-deny: empty github allowlists refuse start / refuse events.

## From the change's testing.md

# Testing

## Local gates

- `bun test` (router allow/deny, dedup, poller fixture→session, config fail-start)
- `bunx tsc --noEmit`
- `bun src/cli.ts github watch` without token → clean non-zero exit
- `specsync check`
- `fledge lanes run verify --non-interactive`

## CI

Bun smoke/test/typecheck + Spec Sync Action. No live webhook secrets required.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-001 | `docs/WATCH.md` + STATUS document poll-first |
| REQ-watch-002 | `tests/watch.poller.test.ts` fixture events → start/continue session |
| REQ-watch-003 | `tests/watch.router.test.ts` deny user/repo quiet refuse; allow starts |
| REQ-watch-004 | `tests/watch.config.test.ts` + `tests/watch.cli.test.ts` missing token/empty allow |
| REQ-watch-005 | `tests/watch.poller.test.ts` dedup skips already-processed ids |
| REQ-cli-watch-001 | `tests/watch.cli.test.ts` github watch clean exit + help mentions watch |

## Where these lessons go

- `specs/watch/context.md`
- `specs/cli/context.md`
