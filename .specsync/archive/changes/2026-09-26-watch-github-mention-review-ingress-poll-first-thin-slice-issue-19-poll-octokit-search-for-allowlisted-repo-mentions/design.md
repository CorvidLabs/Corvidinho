---
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
artifact: design
---

# Design

Poll loop (interval, default 60s) → injectable SearchClient (Octokit live /
fixture tests) → normalize DetectedEvent → dedup processed ids →
`routeEvent` (repo + user allowlist BEFORE session) → SessionStore by
`owner/repo#number` → AgentClient.runChat (`task run --no-verify` or echo).

Webhook HMAC path deferred (follow-up issue). No ProcessManager. No auto-merge.
Default-deny: empty github allowlists refuse start / refuse events.
