---
module: cli
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
---

# Delta — cli (WATCH github watch)

## Modified

### SPEC SECTION Purpose

Operator surface includes Discord HEAR bridge, GitHub WATCH poll, and canonical attribution output for outbound PR bodies.

### SPEC SECTION Behavioral Examples

### Scenario: Github watch missing token

- **Given** no GITHUB_TOKEN / GH_TOKEN
- **When** the operator runs `corvidinho github watch`
- **Then** exit non-zero naming the token env and go-live checklist

### SPEC SECTION Change Log

WATCH `github watch` CLI (#19, 2026-09-26).

| 2026-09-26 | watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions: Add `corvidinho github watch` poll-first ingress CLI (#19) |

## Added

### REQUIREMENT REQ-cli-watch-001

The CLI SHALL expose `corvidinho github watch` to start the poll loop and SHALL surface go-live checklist text on clean failure without printing secrets.

Acceptance Criteria
- Help lists `github watch`; missing token exits non-zero with checklist.
