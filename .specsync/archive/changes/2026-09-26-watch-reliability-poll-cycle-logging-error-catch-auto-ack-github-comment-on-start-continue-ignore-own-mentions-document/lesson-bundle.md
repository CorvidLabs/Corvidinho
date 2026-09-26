# Lesson bundle — watch-reliability-poll-cycle-logging-error-catch-auto-ack-github-comment-on-start-continue-ignore-own-mentions-document

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: WATCH reliability: poll cycle logging + error catch, auto-ack GitHub comment on start/continue, ignore own mentions, document search pagination bury risk (flake harden for GH watch)
- **Kind**: BugFix
- **Specs**: watch, cli
- **Paths**: src/watch/poller.ts, src/watch/searcher.ts, src/watch/ack.ts, src/watch/index.ts, docs/WATCH.md, STATUS.md, specs/watch/watch.spec.md, specs/watch/requirements.md, specs/cli/cli.spec.md, tests/watch.poller.test.ts, tests/watch.ack.test.ts
- **Acceptance**: Every poll cycle logs fetched/new/started/continued/refused/skipped; pollOnce errors are caught and logged (not swallowed by void); when start/continue from mention or issue_comment (sender !== watch username), post short GitHub ack comment with Made with Corvidinho footer once per event id; ignore own corvid-agent mentions/comments in searcher; docs/WATCH.md notes org search per_page=30 pagination bury risk; fixture tests cover logging/ack skip/own-mention skip without live tokens; SpecSync+fledge verify green

## Evidence

- Verification commit: `14a1cb0e5c88a524fb6da80bb48dff8af3f5af63`
- Base commit: `4d83cc3995663588adc0a890389a3560c22853cd`
- Verified by: `specsync check --spec cli --spec watch`

## From the change's context.md

# Context

Leif @mentioned @corvid-agent on arcsite#83 twice; the box WATCH process ran
but never posted in-thread replies. Diagnosis:

1. `void pollOnce()` swallows errors — log only shows the start line.
2. Spawn is local `task run` only — no automatic GitHub comment unless the LLM
   calls `github-issue-comment`.
3. Org search `per_page=30` can bury non-Corvidinho pings under Corvidinho noise
   (secondary).

CoS guidance: harden GH watch if flakes — this is a flake. No new numbered HI
(hi/github.md has GITHUB-1..6 only; fold under existing WATCH/ALLOW behavior).
Do not smash open discord-deny-polish PR #54 — branch from origin/main.

## From the change's design.md

# Design

- **Poll logging:** `pollOnce` logs `fetched/new/started/continued/refused/skipped`
  every cycle; interval/immediate callers wrap with `.catch` so errors surface.
- **Ignore own:** `fetchWatchEvents` skips issue body mentions and comments where
  `sender === mentionUsername` (no self-loop on our acks or own chatter).
- **Auto-ack:** new `src/watch/ack.ts` — injectable `AckClient` (Octokit live /
  echo dry-run/tests). On `start_session` / `continue_session` for
  `issue_comment` | `issues` only, when sender ≠ watch username and event id not
  yet acked, post short ack + Made with Corvidinho markdown footer via Octokit
  `issues.createComment` (same capability as github-issue-comment; watch stays
  self-contained). `AckedIdStore` dedups ack per event id.
- **Pagination:** raise search `per_page` to 100; document bury risk in
  `docs/WATCH.md` when org-wide noise exceeds one page.
- No new HI numbers; no allowlist / ProcessManager / webhook changes.

## From the change's testing.md

# Testing

- Unit/fixture: own-sender comments/issues omitted from `fetchWatchEvents`.
- Unit/fixture: ack posts once per event id; skips when sender === watch username;
  skips non-mention types; dry-run/echo does not call live GitHub.
- Poller: cycle result counters logged; injected failing fetch surfaces via catch
  path (or pollOnce rejects observed by wrapper).
- No live GitHub tokens in CI.

## Requirement evidence

| Requirement | How proven |
|-------------|------------|
| REQ-watch-007 | `tests/watch.ack.test.ts` + `tests/watch.poller.test.ts` |

## Automated coverage

- `bun test tests/watch.ack.test.ts tests/watch.poller.test.ts`
- `bunx tsc --noEmit`
- `specsync check`
- `fledge lanes run verify --non-interactive`

## Where these lessons go

- `specs/watch/context.md`
- `specs/cli/context.md`
