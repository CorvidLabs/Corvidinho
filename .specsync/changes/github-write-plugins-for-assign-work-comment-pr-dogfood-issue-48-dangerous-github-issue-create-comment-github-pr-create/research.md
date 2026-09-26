---
change: github-write-plugins-for-assign-work-comment-pr-dogfood-issue-48-dangerous-github-issue-create-comment-github-pr-create
artifact: research
---

# Research

## Ancestors

- Fledge / Corvidinho plugin host (#6/#15): `dangerous` + `minTier` on PluginCommand;
  `runPlugin` SAFE-1 deny via CORVIDINHO_ALLOWLIST.
- Discord `discord-post-message`: dangerous write + channel allowlist + dry-run env —
  mirror for GitHub writes (repo gate instead of channel).
- WATCH #19: Octokit/fixture searcher already uses `involves:` which includes
  assignees; emitting assignment events is a thin normalize step.
- Attribution #20/#24: shared `attribution()` helpers — reuse for PR bodies.

## Explicitly out of scope

Auto-merge, webhook server, inventing HI, Discord slash/MEMORY workstreams,
live `github watch` in this session.
