---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: docs
---

# Docs

- `docs/DISCORD-GO-LIVE.md` (E.3 allowlist notes): the non-git verify
  sentence also names a `delegate` worker that ended without its result
  (stopped at its timeout, crashed, or never started).
- `docs/WATCH.md`: the `GITHUB_TOKEN` over `GH_TOKEN` sentence says a blank
  (whitespace-only) one counts as unset for WATCH, the Octokit plugins and
  `corvidinho doctor`.
- `specs/agent/agent.spec.md`: the non-git verify invariant and its Error
  Cases row name a `delegate` whose worker left no result frame; the verify
  feedback invariant says the surrogate guard covers where the error-line
  scan stops.
- `specs/plugins/plugins.spec.md`: PR create appends the footer unless the
  body already holds `ATTRIBUTION_MARKDOWN` / `ATTRIBUTION_PLAIN`; the Octokit
  token is trimmed and a blank one is missing.
- `specs/cli/cli.spec.md`: the blank-token rule covers the `github` line; the
  Error Cases row names `[missing] github`.
- `specs/*/testing.md`: evidence lines for each new test. Versions and change
  logs are left to `specsync change check --commit` (materialize).
- README unchanged (it says only that Corvidinho reads `GITHUB_TOKEN` /
  `GH_TOKEN`); no CHANGELOG/STATUS edit (bug-fix slice).
