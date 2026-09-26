---
change: task-run-task-always-takes-the-next-argv-item-as-task-text-so-untrusted-discord-github-text-that-looks-like-a-flag-tier
artifact: context
---

# Context

Found while reviewing PR #139. `parseGlobalFlags` only took the value after
`--task` when it did not start with `-`. The Discord bridge and WATCH pass the
user's message (Discord) or mention text (GitHub) as that value. A message
such as `--tier=code`, `--no-verify` or `--max-retries=9` therefore lost its
task text and was parsed as a CLI flag, letting message text pick the
capability tier. AGENT-5 says the operator picks the provider and tier, not
the message author.
