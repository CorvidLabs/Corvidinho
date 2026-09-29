---
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
artifact: tasks
---

# Tasks

- [x] Re-check the four W12 records on `origin/main` `5366fff`: all reproduce (none dropped).
- [x] `verifyFeedbackExcerpt` never ends its error-line scan on the high half of a surrogate pair; sweep test in `tests/agent.verify-feedback.test.ts`.
- [x] Tool loop names `delegate` in `unreportedEditTools` when its worker left no result frame; frameless-worker case in `tests/agent.allowlisted-dangerous.test.ts`.
- [x] `github-pr-create` appends the footer unless the body holds `ATTRIBUTION_MARKDOWN` / `ATTRIBUTION_PLAIN`; dry-run cases in `tests/github.write.plugin.test.ts`.
- [x] Doctor's `github` line and `getGithubToken` trim tokens; cases in `tests/cli.doctor-truth.test.ts` and `tests/github.fixture.test.ts`.
- [x] Fail-on-main proof: main's five source files swapped in → 6 of 69 fail; restored → 69 pass.
- [x] Deltas modify REQ-agent-002 / 502, REQ-plugins-003 / 051, REQ-cli-003; spec prose, testing evidence, `docs/DISCORD-GO-LIVE.md`, `docs/WATCH.md`.
- [x] `specsync check --require-coverage 100`, `hi check`, `bunx tsc --noEmit`, `bun test`, `fledge lanes run verify --non-interactive` green.
