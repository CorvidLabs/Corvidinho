---
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
artifact: context
---

# Context

Issue #19 WATCH: GitHub citizen listen — when someone @mentions / review-requests
Corvidinho on allowlisted org/repo/user, start or continue an agent session.
Typed Octokit reads (#4/#15) already exist; this is **ingress**, not more reads.

Ancestor map (archived corvid-agent): poll preferred for bot/VM without public
URL (`MentionPollingService` + `GitHubSearcher`); webhook when public URL +
HMAC secret exist. Gate every event through allowlist before session spawn
(ALLOW-1). Skip auto-merge / auto-update / CI-retry for v1.

Corvidinho shape: headless CLI thin like Discord HEAR — injectable searcher
(fixtures in CI), in-memory session stub keyed by `owner/repo#number`, spawn
`task run --no-verify` (or echo). No ProcessManager. No invent HI/ACCESS/bounty.

Memory/STATUS preference: **poll-first for VM**; webhook deferred follow-up.
