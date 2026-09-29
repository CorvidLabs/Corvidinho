---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: context
---

# Context

W12 bug sweep, Wave 0 of Leif's 2026-09-28 interview ("no new criteria"):
four surviving records from `/home/user/coord/w12.json`, each a small fix
against criteria already captured. Each was re-checked on `origin/main`
`5366fff` before building and still reproduced; none was dropped.

- `verify-feedback-lone-surrogate` (REQ-agent-002, AGENT-4.a).
  `verifyFeedbackExcerpt` scans error lines in
  `log.slice(sectionStart, scanEnd)`, with
  `scanEnd = log.length - tailBudget`. When `scanEnd` falls between a high
  and a low surrogate, the last scanned line ends on a lone high surrogate;
  `capLine` guards only its own 300-char cut and `tailOf` only its own start,
  so that line is kept and reaches the provider in the retry feedback. The
  existing "never half a surrogate pair" test had no emoji line straddling
  `scanEnd`.
- `delegate-lost-result-nongit-done` (AGENT-4, FLEDGE-2, REQ-agent-085 /
  REQ-agent-502). A `delegate` worker's edits reach the lead only through the
  `filesChanged` of its NDJSON result frame. A worker that is killed at its
  timeout, stopped by an abort, crashes or never starts leaves no frame, so
  the lead sees `filesChanged: []`; in a non-git project (no real diff)
  `delegate` was named as a tool with unreported edits only when the
  allowlist named a Fledge plugin command, so the lead ended `done` with
  verify skipped although the worker had written `app.ts`.
- `github-pr-create-attribution-substring` (REQ-plugins-051).
  `withAttribution` treated any body containing both "Made with" and
  "Corvidinho" as already attributed, so "Made with Bun; fixes the
  Corvidinho watch poller." opened a PR with no footer.
- `doctor-github-blank-token-ok` (CLI-4, REQ-cli-003). Doctor's `github`
  line used an untrimmed `envPresent`, so a whitespace-only `GITHUB_TOKEN`
  printed `[ok] github` next to `[missing] github-watch`; `getGithubToken`
  did not trim either, so a blank `GITHUB_TOKEN` shadowed a real `GH_TOKEN`
  and was sent to Octokit as the credential (401 later).

Constraints: bug fix only; smallest change per record, one regression test
per record that fails on main; no new env var, config key, flag, command,
data field, table or package bump; no CHANGELOG/STATUS edit; #232/#233 scope
untouched; no hi capture (no new criteria).
