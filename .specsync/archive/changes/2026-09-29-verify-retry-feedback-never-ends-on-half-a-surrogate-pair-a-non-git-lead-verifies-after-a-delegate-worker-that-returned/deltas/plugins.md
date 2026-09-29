---
module: plugins
change: verify-retry-feedback-never-ends-on-half-a-surrogate-pair-a-non-git-lead-verifies-after-a-delegate-worker-that-returned
---

# Delta: plugins (github-pr-create attribution check is exact; a blank GITHUB_TOKEN / GH_TOKEN is missing for Octokit — REQ-plugins-051, REQ-plugins-003)

## Modified

### REQUIREMENT REQ-plugins-003

Built-in read-only GitHub commands SHALL call GitHub via Octokit (`GITHUB_TOKEN`/`GH_TOKEN`), not shell `gh` (GITHUB-1/4). The Octokit token (read and write commands alike) SHALL be `GITHUB_TOKEN`, else `GH_TOKEN`, each trimmed: a blank (whitespace-only) token SHALL count as missing, as WATCH reads it, so it never shadows the other and never reaches Octokit as the credential; with no usable token `createOctokit` SHALL refuse with its missing-token error before any request. No env var or config key is added.

Acceptance Criteria
- github-pr-list/status/ci-status/issue-list use `@octokit/rest`.
- No `Bun.spawn(["gh", ...])` in plugin bodies.
- `getGithubToken` with a whitespace-only `GITHUB_TOKEN` and a real `GH_TOKEN` returns the `GH_TOKEN`; `GITHUB_TOKEN` still wins when both are real; blank tokens only return no token and `createOctokit` refuses with `missing GITHUB_TOKEN or GH_TOKEN`.

### REQUIREMENT REQ-plugins-051

github-pr-create SHALL append plain Made with Corvidinho markdown attribution when missing and SHALL NOT insert @handles. The attribution SHALL count as present only when the body holds its canonical markdown (`ATTRIBUTION_MARKDOWN`) or plain (`ATTRIBUTION_PLAIN`) form from `src/attribution.ts`; a body that merely contains the words "Made with" and "Corvidinho" SHALL still get the footer.

Acceptance Criteria
- dry-run body contains Made with Corvidinho link and no @Corvidinho.
- A dry-run body `Made with Bun; fixes the Corvidinho watch poller.` comes back with `\n\n---\n` and `ATTRIBUTION_MARKDOWN` appended; a body that already holds `ATTRIBUTION_MARKDOWN` or `ATTRIBUTION_PLAIN` comes back unchanged (no second footer).
