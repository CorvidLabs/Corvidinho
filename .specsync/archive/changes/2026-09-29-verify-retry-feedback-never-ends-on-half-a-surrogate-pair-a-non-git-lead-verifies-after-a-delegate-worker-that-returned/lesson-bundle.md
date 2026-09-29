# Lesson bundle — verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Verify retry feedback never ends on half a surrogate pair; a non-git lead verifies after a delegate worker that returned no result frame; github-pr-create attribution check is exact; doctor and the Octokit plugins treat a blank GITHUB_TOKEN / GH_TOKEN as missing
- **Kind**: BugFix
- **Specs**: agent, plugins, cli
- **Paths**: src/agent/verify.ts, src/agent/execute.ts, plugins/github/commands.ts, plugins/github/api.ts, src/cli.ts, tests/agent.verify-feedback.test.ts, tests/agent.allowlisted-dangerous.test.ts, tests/github.write.plugin.test.ts, tests/github.fixture.test.ts, tests/cli.doctor-truth.test.ts, docs/DISCORD-GO-LIVE.md, docs/WATCH.md, specs/agent/agent.spec.md, specs/agent/requirements.md, specs/agent/testing.md, specs/plugins/plugins.spec.md, specs/plugins/requirements.md, specs/plugins/testing.md, specs/cli/cli.spec.md, specs/cli/requirements.md, specs/cli/testing.md
- **Acceptance**: verifyFeedbackExcerpt never keeps an error line that ends on half a surrogate pair when the end of its error-line scan falls inside an emoji, at 4000 and at runTask's 3946 cap; in a non-git project a delegate call whose worker ran but left no result frame (killed, timed out, crashed; its data has no verified) is named in unreportedEditTools, so the lead runs the verify lane once and ends failed on a failing lane instead of done with verify skipped, whatever the allowlist; github-pr-create appends the Made with Corvidinho footer unless the body already holds ATTRIBUTION_MARKDOWN or ATTRIBUTION_PLAIN, so a body that only mentions the two words gets it and one that has it does not get a second; doctor prints [missing] github for a whitespace-only GITHUB_TOKEN/GH_TOKEN, and getGithubToken / createOctokit treat a blank token as missing so it never shadows a real GH_TOKEN or reaches Octokit; each has a regression test that fails on main and passes here; no new env var, config key, flag, command, data field or schema change

## Evidence

- Verification commit: `9fd712626f697631f3b7a2645b0c9554e58ab397`
- Base commit: `5366fff96501327ad3bcc30f55105f2c16884b0b`
- Verified by: `specsync check --spec agent --spec cli --spec plugins`

## From the change's context.md

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

## From the change's design.md

# Design

- `src/agent/verify.ts` `verifyFeedbackExcerpt`: `scanEnd` becomes `let`;
  when it is past `sectionStart` and lands on a low surrogate it moves back
  one, so the scanned slice never ends on the high half of a pair. The kept
  end of the log (`tailOf`) already refuses to start on a low surrogate and
  `capLine` already guards its own cut, so this closes the last cut. Output
  is unchanged for every input whose scan end is not inside a pair.
- `src/agent/execute.ts` tool loop: `delegate` is added to
  `unreportedEditTools` when a worker ran (`result.data` present; a refusal
  carries none) and either the run's allowlist names a Fledge plugin command
  (unchanged) or the data has no boolean `verified`. Every result frame
  carries `TaskResult.verified` and the delegate command copies it into its
  data only from a frame, so its absence means no frame was read: whatever
  the worker edited reached the lead nowhere. `runTask` then fails closed in
  a non-git project exactly as for a Fledge command (one `Verify gate: no git
  working tree to diff` note naming `delegate`). No new data field. A git
  project keeps the real diff, which sees the worker's edits anyway. A
  non-ADMIN role session is never offered `delegate` (mutating), so the
  role-session case does not arise.
- `plugins/github/commands.ts` `withAttribution`: the body counts as
  attributed only when it contains `ATTRIBUTION_MARKDOWN` or
  `ATTRIBUTION_PLAIN` (imported from `src/attribution.ts`, the one place the
  footer text lives). Otherwise the existing `\n\n---\n` + markdown footer is
  appended as before; no @handles.
- `src/cli.ts` `envPresent` trims, so doctor's `github` line agrees with
  `github-watch` (`src/doctor.ts` `present()`) and with WATCH. It is used
  only for that line.
- `plugins/github/api.ts` `getGithubToken`:
  `env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || undefined`, the same
  expression as WATCH's `resolveToken`. A blank `GITHUB_TOKEN` no longer
  shadows `GH_TOKEN`; blank-only gives the existing missing-token refusal in
  `createOctokit` before any request. `GITHUB_TOKEN` still wins when both are
  real.

## From the change's testing.md

# Testing

With `origin/main`'s (`5366fff`) `src/agent/verify.ts`, `src/agent/execute.ts`,
`plugins/github/commands.ts`, `plugins/github/api.ts` and `src/cli.ts`
swapped in, `bun test tests/agent.verify-feedback.test.ts
tests/agent.allowlisted-dangerous.test.ts tests/github.write.plugin.test.ts
tests/github.fixture.test.ts tests/cli.doctor-truth.test.ts` gives 63 pass,
6 fail (the six new tests below); with this branch's files restored, 69 pass,
0 fail.

## Requirement evidence

| Requirement | Test | Evidence |
|---|---|---|
| `REQ-agent-002` (no half surrogate pair where the error-line scan stops) | `tests/agent.verify-feedback.test.ts` | "an emoji error line cut by the end of the error-line scan…": 61 noise counts after a 20-emoji `error:` line, caps 3946 (runTask's) and 4000: every excerpt is within the cap, names `Failing step: test (step 3 of lane 'verify')` and holds no lone surrogate. On main 3 inputs at 3946 end an error line on a lone high surrogate. |
| `REQ-agent-502` / `REQ-agent-085` (frameless delegate worker, non-git) | `tests/agent.allowlisted-dangerous.test.ts` | "a worker that edits app.ts and dies before its result frame…": empty allowlist, autonomous on, worker `printf broken > "$PWD/app.ts"; exit 137`; the delegate ToolResult fails ("did not finish"), `app.ts` is `broken`, verify runs once in the project dir, the run ends `failed` with `verified=false`, `verifySkipped=false`, and the `Verify gate: no git working tree to diff` note names `delegate`. On main verify never runs and the run ends `done`. The existing framed-worker cases (fledge allowlist verifies; no `fledge-*` skips) pass unchanged. |
| `REQ-plugins-051` (exact attribution) | `tests/github.write.plugin.test.ts` | "dry-run pr-create: a body that only mentions…": `Made with Bun; fixes the Corvidinho watch poller.` returns that body + `\n\n---\n` + `ATTRIBUTION_MARKDOWN`; bodies already holding `ATTRIBUTION_MARKDOWN` or `ATTRIBUTION_PLAIN` return unchanged. On main the first body gets no footer. |
| `REQ-plugins-003` (blank Octokit token is missing) | `tests/github.fixture.test.ts` | `getGithubToken({GITHUB_TOKEN:"   ", GH_TOKEN:"ghp_fixtureNotReal"})` is the `GH_TOKEN`; both real → `GITHUB_TOKEN`; blank-only → `undefined`, and `createOctokit({GITHUB_TOKEN:"   "})` refuses with `missing GITHUB_TOKEN or GH_TOKEN`. On main the blank token is returned and passed to Octokit. |
| `REQ-cli-003` (doctor `github` line) | `tests/cli.doctor-truth.test.ts` | "a blank GITHUB_TOKEN / GH_TOKEN is missing for the Octokit plugins too…": real CLI, clean env; whitespace-only `GITHUB_TOKEN` and `GH_TOKEN` print `[missing] github: missing GITHUB_TOKEN or GH_TOKEN for Octokit plugins`, no `[ok] github:`, `[missing] github-watch`, exit 1; blank `GITHUB_TOKEN` + real `GH_TOKEN` prints `[ok] github` and no token value. On main the blank pair prints `[ok] github`. |

## Automated coverage

- `bunx tsc --noEmit` — passed.
- `bun test` — see the change check record.
- `specsync check --require-coverage 100` — passed.
- `hi check` — passed.
- `fledge lanes run verify --non-interactive` — green (see the change check record).

## Where these lessons go

- `specs/agent/context.md`
- `specs/plugins/context.md`
- `specs/cli/context.md`
