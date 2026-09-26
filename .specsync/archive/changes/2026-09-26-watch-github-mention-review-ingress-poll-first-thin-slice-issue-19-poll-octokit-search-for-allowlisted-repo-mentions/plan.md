---
change: watch-github-mention-review-ingress-poll-first-thin-slice-issue-19-poll-octokit-search-for-allowlisted-repo-mentions
artifact: plan
---

# Plan

1. `src/watch/*` thin modules: types, config, searcher, dedup, router, session-store, agent-client, poller
2. CLI: `github watch`; doctor/help go-live hints; STATUS + docs/WATCH.md document poll-first
3. Specs: `specs/watch/` + cli delta; registry/config
4. Fixture tests: router allow/deny, dedup, poller→session with injected events, missing token clean exit
5. Comment on #19 that webhook is follow-up; STATUS Done cites #19→PR
6. SpecSync check + fledge verify; PR; squash-merge when green
