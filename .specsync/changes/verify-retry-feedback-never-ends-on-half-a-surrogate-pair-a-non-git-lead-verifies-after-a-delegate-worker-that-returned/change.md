---
id: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
state: implementing
type: bug_fix
base_commit: 5366fff96501327ad3bcc30f55105f2c16884b0b
---

# Verify retry feedback never ends on half a surrogate pair; a non-git lead verifies after a delegate worker that returned no result frame; github-pr-create attribution check is exact; doctor and the Octokit plugins treat a blank GITHUB_TOKEN / GH_TOKEN as missing

## Intent

Verify retry feedback never ends on half a surrogate pair; a non-git lead verifies after a delegate worker that returned no result frame; github-pr-create attribution check is exact; doctor and the Octokit plugins treat a blank GITHUB_TOKEN / GH_TOKEN as missing

## Affected Canonical Specs

- `agent`
- `plugins`
- `cli`

## Acceptance Criteria

- verifyFeedbackExcerpt never keeps an error line that ends on half a surrogate pair when the end of its error-line scan falls inside an emoji, at 4000 and at runTask's 3946 cap; in a non-git project a delegate call whose worker ran but left no result frame (killed, timed out, crashed; its data has no verified) is named in unreportedEditTools, so the lead runs the verify lane once and ends failed on a failing lane instead of done with verify skipped, whatever the allowlist; github-pr-create appends the Made with Corvidinho footer unless the body already holds ATTRIBUTION_MARKDOWN or ATTRIBUTION_PLAIN, so a body that only mentions the two words gets it and one that has it does not get a second; doctor prints [missing] github for a whitespace-only GITHUB_TOKEN/GH_TOKEN, and getGithubToken / createOctokit treat a blank token as missing so it never shadows a real GH_TOKEN or reaches Octokit; each has a regression test that fails on main and passes here; no new env var, config key, flag, command, data field or schema change

## No-spec Rationale

Not applicable
