---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: testing
---

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
