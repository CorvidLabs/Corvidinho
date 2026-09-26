---
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
artifact: research
---

# Research

Ancestors (archived CorvidLabs/corvid-agent):
- `server/polling/service.ts` + `github-searcher.ts` — interval poll, processed-id
  dedup, DetectedMention types (issue_comment|issues|pull_request_review_comment|
  pull_request|assignment|review_request)
- `server/webhooks/service.ts` — HMAC webhook (deferred for Corvidinho v1)
- Allowlist gates: repo allow + user allow before session; empty = deny
- Skip auto-merge / auto-update / CI-retry for ingress slice

Corvidinho already has `src/allowlist/github.ts` (isRepoAllowed,
isGithubUserAllowed) and Octokit plugins (#15). Discord HEAR shows the session
stub + echo/spawn agent-client shape to mirror.
